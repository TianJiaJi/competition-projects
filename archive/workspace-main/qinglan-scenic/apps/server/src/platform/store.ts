import { db as defaultDb } from '../database.ts';
import type {Database} from '../postgres.ts';
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import type { Account } from '../../../../packages/contracts/src/platform.ts';
export class DomainError extends Error {
    status: number;
    code: string;
    constructor(code: string, message: string, status = 409) { super(message); this.code = code; this.status = status; }
}
export function assert(ok: unknown, code: string, message: string, status = 409): asserts ok {
    if (!ok)
        throw new DomainError(code, message, status);
}
export function textField(value: unknown, max = 500) { assert(typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= max, 'VALIDATION_ERROR', `请输入1—${max}字`, 400); return value.trim(); }
function credentialField(value: unknown, label: string, max: number) { assert(typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value), 'VALIDATION_ERROR', `${label}长度或字符无效`, 400); return value; }
export function integer(value: unknown, min = 0, max = 10000) { assert(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, 'VALIDATION_ERROR', '整数范围不正确', 400); return value; }
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export function passwordHash(value: string) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(value, salt, 32).toString('hex'); }
function checkPassword(value: string, hash: string) { const [salt, key] = hash.split(':'); return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(value, salt, 32)); }
export function openStore(db:Database=defaultDb) {
    const get = async <T>(c: string, id: string, run = ''): Promise<T | undefined> => {
        const row = (await db.prepare("SELECT data FROM documents WHERE collection=$1 AND id=$2 AND run_id=$3").get(c, id, run)) as {
            data: string;
        } | undefined;
        return row ? JSON.parse(row.data) : undefined;
    };
    const put = async (c: string, id: string, value: unknown, run = '') => (await db.prepare("INSERT INTO documents VALUES($1,$2,$3,$4) ON CONFLICT(collection,id,run_id) DO UPDATE SET data=excluded.data").run(c, id, run, JSON.stringify(value)));
    const list = async <T>(c: string, run = ''): Promise<T[]> => ((await db.prepare("SELECT data FROM documents WHERE collection=$1 AND run_id=$2 ORDER BY id").all(c, run)) as {
        data: string;
    }[]).map(x => JSON.parse(x.data));
    const transaction = db.transaction;
    const account = (r: Record<string, unknown>): Account => ({ id: String(r.id), username: String(r.username), name: String(r.name), role: r.role as Account['role'], disabled: Boolean(r.disabled), simulated: Boolean(r.simulated) });
    async function session(user: Account) { const token = randomBytes(32).toString('hex'); (await db.prepare("INSERT INTO auth_sessions VALUES($1,$2,$3)").run(digest(token), user.id, Date.now() + 7 * 86400000)); return { token, user }; }
    async function login(username: string, password: string) { credentialField(username, '用户名', 32); credentialField(password, '密码', 128); const row = (await db.prepare("SELECT * FROM accounts WHERE username=$1").get(username)) as Record<string, unknown> | undefined; assert(row && !row.disabled && !row.simulated && checkPassword(password, String(row.password)), 'AUTH_INVALID', '账号或密码不正确', 401); return (await session(account(row))); }
    async function register(username: string, name: string, password: string) { assert(/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(username), 'VALIDATION_ERROR', '用户名为3—32位字母、数字或下划线，以字母开头', 400); textField(name, 30); assert(password.length >= 6 && password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(password), 'VALIDATION_ERROR', '密码为6—128位且不得包含控制字符', 400); assert(!(await db.prepare("SELECT id FROM accounts WHERE username=$1").get(username)), 'USERNAME_EXISTS', '用户名已存在'); const id = randomUUID(); (await db.prepare("INSERT INTO accounts(id,username,name,role,password) VALUES($1,$2,$3,$4,$5)").run(id, username, name, 'visitor', passwordHash(password))); return (await session({ id, username, name, role: 'visitor', disabled: false, simulated: false })); }
    async function authenticate(token: string) { const row = (await db.prepare("SELECT a.* FROM accounts a JOIN auth_sessions s ON s.user_id=a.id WHERE s.token=$1 AND s.expires>$2 AND a.disabled=false").get(digest(token), Date.now())) as Record<string, unknown> | undefined; return row ? account(row) : undefined; }
    async function command<T>(scope: string, key: string, request: unknown, work: () => T | Promise<T>): Promise<T> {
        assert(key.length >= 8 && key.length <= 128, 'VALIDATION_ERROR', '必须提供8—128位幂等键', 400);
        const fingerprint = digest(JSON.stringify(request));
        return (await transaction(async () => {
            const old = (await db.prepare("SELECT * FROM commands WHERE scope=$1 AND key=$2").get(scope, key)) as {
                fingerprint: string;
                result: string;
            } | undefined;
            if (old) {
                assert(old.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', '幂等键已用于其他请求');
                return JSON.parse(old.result);
            }
            const result = await work();
            (await db.prepare("INSERT INTO commands VALUES($1,$2,$3,$4)").run(scope, key, fingerprint, JSON.stringify(result)));
            return result;
        }));
    }
    return { db, get, put, list, transaction, login: (u:string,p:string)=>transaction(()=>login(u,p)), register:(u:string,n:string,p:string)=>transaction(()=>register(u,n,p)), authenticate, command, account };
}
export type Store = ReturnType<typeof openStore>;
