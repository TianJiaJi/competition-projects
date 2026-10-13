import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
// Preserve existing JSON text and millisecond-number semantics at the repository boundary.
pg.types.setTypeParser(20, value => { const n = Number(value); if (!Number.isSafeInteger(n))
    throw Error('BIGINT_OUT_OF_RANGE'); return n; });
pg.types.setTypeParser(3802, value => value);
export const schemaVersion = 2;
function bounded(name: string, fallback: number, max: number) { const n = Number(process.env[name] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > max)
    throw Error('Invalid ' + name); return n; }
export function openDatabase(url = process.env.DATABASE_URL) {
    if (!url)
        throw Error('DATABASE_URL is required; run db:migrate and db:import before starting');
    if(process.env.PG_CA_FILE&&[...new URL(url).searchParams.keys()].some(k=>k.startsWith('ssl')))throw Error('Configure TLS through PG_CA_FILE, without ssl query parameters');
    const local = process.env.PG_ALLOW_INSECURE === '1';
    if (process.env.NODE_ENV === 'production' && !local && !process.env.PG_CA_FILE)
        throw Error('Production requires PG_CA_FILE for verified TLS');
    const pool = new pg.Pool({ connectionString: url, max: bounded('PG_POOL_MAX', 8, 32), connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: bounded('PG_STATEMENT_TIMEOUT_MS', 120000, 600000), ssl: process.env.PG_CA_FILE ? { rejectUnauthorized: true, ca: readFileSync(process.env.PG_CA_FILE, 'utf8') } : undefined });
    pool.on('error', () => console.error('PostgreSQL idle connection failed'));
    const context = new AsyncLocalStorage<pg.PoolClient>();
    async function query(sql: string, values: unknown[] = []):Promise<pg.QueryResult> { if(!context.getStore() && /^(INSERT|UPDATE|DELETE)/i.test(sql.trim()))return transaction(()=>query(sql,values)); return (context.getStore() || pool).query(sql, values); }
    let queue:Promise<void>=Promise.resolve();
    async function transaction<T>(work: () => T | Promise<T>): Promise<T> {
        if (context.getStore())
            return await work();
        const previous=queue;let finish!:()=>void;queue=new Promise<void>(resolve=>{finish=resolve;});await previous;
        let client:pg.PoolClient;
        try{client=await pool.connect();}catch(error){finish();throw error;}
        try {
            await client.query('BEGIN');
            // A database-wide write lock protects document quotas, versions and idempotency across processes.
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema(),736236110))");
            const result = await context.run(client, work);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();finish();
        }
    }
    // Consistent multi-query HTTP snapshots use MVCC, without joining the writer queue.
    async function readTransaction<T>(work: () => T | Promise<T>): Promise<T> {
        if (context.getStore()) return await work();
        const client = await pool.connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const result = await context.run(client, work);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    }
    const prepare = (sql: string) => ({ get: async (...v: unknown[]) => (await query(sql, v)).rows[0], all: async (...v: unknown[]) => (await query(sql, v)).rows, run: async (...v: unknown[]) => ({ changes: (await query(sql, v)).rowCount }) });
    async function ready() { const r = await query("SELECT pg_is_in_recovery() AS recovery,current_setting('transaction_read_only') AS readonly,(SELECT max(version) FROM schema_migrations) AS version"); if (r.rows[0].recovery || r.rows[0].readonly !== 'off' || r.rows[0].version !== schemaVersion)
        throw Error('DATABASE_NOT_READY'); }
    let lease:pg.PoolClient|undefined;
    async function startWriter(){lease=await pool.connect();const r=await lease.query('SELECT pg_try_advisory_lock(hashtextextended(current_schema(),736236111)) AS locked');if(!r.rows[0].locked){lease.release();lease=undefined;throw Error('ANOTHER_BACKEND_IS_ACTIVE');}}
    return { query, prepare, transaction, readTransaction, ready, startWriter, close:async()=>{if(lease){await lease.query('SELECT pg_advisory_unlock(hashtextextended(current_schema(),736236111))');lease.release();lease=undefined;}await pool.end();} };
}
export type Database = ReturnType<typeof openDatabase>;
