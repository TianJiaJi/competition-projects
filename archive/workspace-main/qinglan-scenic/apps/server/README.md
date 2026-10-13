# 景区统一后端（PostgreSQL 17）

Node.js 24 + `pg` 连接池，平台和问答共用一个 PostgreSQL 数据库。六端仍使用原有 HTTP/WS 契约。普通启动只校验 schema 和恢复中断的 QA 任务，不建库、不重置运行、不创建演示账号。

本地配置放在已忽略的 `.env.local`，保留已有 DeepSeek 配置：

- `DATABASE_URL`：应用账号连接串；迁移命令使用具有 DDL 权限的管理员连接串。
- `HOST=127.0.0.1`、`PORT=8787`；容器设置 `HOST=0.0.0.0`。
- `PG_POOL_MAX=8`（1–32）、`PG_STATEMENT_TIMEOUT_MS=120000`。
- 生产环境设置 `PG_CA_FILE`，校验服务器证书；仅私有 Compose 联调可设置 `PG_ALLOW_INSECURE=1`。
- `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`DEEPSEEK_API_KEY` 保持现有配置；密钥不进入前端。

从工作区根目录，按顺序运行：

```sh
# 先创建空数据库，并通过环境提供管理员 DATABASE_URL。
pnpm --filter @scenic/server db:migrate
pnpm --filter @scenic/server db:import /absolute/platform-backup.sqlite /absolute/qa-backup.sqlite /absolute/import-report.json
# 切换为应用账号后启动。
pnpm dev:server
```

导入前必须停写并用 SQLite backup API 创建两库一致性备份。导入要求空目标，完整事务、逐表标准化校验和；同源重跑仅返回已导入，不覆盖后续业务。历史检查点清理由独立迁移记录。SQLite 只存在于导入工具，正式运行不读取旧库。

全新演示库可单独执行 `SCENIC_SEED_DEMO=1 pnpm --filter @scenic/server db:seed-demo`，只补缺；生产环境禁止该命令。原库迁移无需播种。开发演示账号 admin01–02、staff01–03、visitor01–05 的初始密码为 123456；已迁移密码不变。

健康检查：`/api/v1/health/live` 仅验证进程；`/api/v1/health/ready` 验证数据库连接、schema 版本、可写主库和选中运行。`/api/v1/health` 保留兼容入口。后台进程持有数据库单活动实例锁，所有业务写入使用事务 advisory lock；嵌套事务共用连接，提交后广播。退出时停止时钟、取消 AI、等待事务后释放连接。

`pnpm test` 中数据库测试使用独立临时 schema。先创建 `scenic_test`，设置 `TEST_DATABASE_URL`（本机默认 `postgresql://aiden@127.0.0.1/scenic_test`）；Playwright 同样使用隔离 schema，不接触本地展示库。测试模型使用明确的假上游。

本地迁移、回退演练和访问入口见 [实施记录](../../docs/implementation/PG迁移与本地联调-2026-09-13.md)。生产主备初始化仍按独立的主备需求实施。
