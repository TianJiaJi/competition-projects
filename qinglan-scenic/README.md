# 青岚山境 · 智慧景区演示系统

基于 pnpm workspace 的单仓库项目，包含六个前端和一个统一 Node.js 后端，使用 Vue 3、TypeScript、Three.js、uni-app 与 PostgreSQL 17。游客导览、园方监控、游客预约、前线处置、管理员审批和演示控制已接入共享运行数据，通过 HTTP 与 WebSocket 联动。

当前为本地演示与联调版本，客流、设施遥测及到离园事件使用模拟数据。PostgreSQL 迁移已完成；生产主备、公网部署、人脸设备和正式微信真机验收尚未完成。最新数据库与联调状态见 [PG 迁移与本地联调记录](docs/implementation/PG迁移与本地联调-2026-09-13.md)，业务范围与欠项见 [六端当前接口与交付记录](docs/implementation/六端当前接口与交付记录.md)及[验收台账](docs/implementation/六端确认与验收台账.md)。旧原型说明中的本地存储、SQLite 路径和旧演示入口不再代表当前默认实现。

## 快速开始

准备 Node.js 24、pnpm 10.17.1（见 `package.json` 的 `packageManager`）和可访问的 PostgreSQL 17。以下命令均从仓库根目录执行。

```sh
pnpm install
```

### 配置与初始化数据库

后端配置文件为 `apps/server/.env.local`，已被 Git 忽略。配置 `DATABASE_URL` 指向目标数据库，例如：

```dotenv
DATABASE_URL=postgresql://scenic_app:replace_me@127.0.0.1:5432/scenic_local
HOST=127.0.0.1
PORT=8787
```

先创建数据库与账号。使用具有 DDL 权限的管理员连接串执行迁移；若需授予应用账号权限，同时设置 `PG_APP_ROLE`。连接串可通过环境变量提供，或临时配置到上述文件，迁移后切回应用账号。

```sh
pnpm --filter @scenic/server db:migrate
```

根据数据来源选择初始化方式：

- **全新本地演示库**：切换到有业务表写入权限的账号后，执行下方播种命令，补齐演示账号、基础内容与默认运行。该命令禁止用于生产环境。
- **已有 SQLite 数据迁移**：停写并备份后，按[后端说明](apps/server/README.md)执行 `db:import`，导入要求空目标；已迁移数据库无需再次播种。
- **已有可用 PostgreSQL 库**：完成所需 schema 迁移后直接启动，保留当前数据与运行。

```sh
# 仅用于全新本地演示库
SCENIC_SEED_DEMO=1 pnpm --filter @scenic/server db:seed-demo
```

普通启动不会自动建库、迁移 schema、创建演示账号或重置运行。AI 功能还需在服务端配置 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 和 `DEEPSEEK_API_KEY`；密钥不得放入前端 `VITE_*` 配置。连接池、TLS 与数据导入细节见[后端说明](apps/server/README.md)。

### 启动六端

```sh
pnpm dev:all
```

该命令补启后端、六个业务前端与测试面板，已监听的端口会跳过；不会启动 PostgreSQL 或初始化数据库。也可在不同终端按需启动后端与指定前端：

| 应用 | 启动命令 | 默认地址 | 主要用途 |
| --- | --- | --- | --- |
| 游客大屏 | `pnpm dev` | [localhost:5173](http://localhost:5173/) | 三维沙盘、客流热力、设施查询与步行选路，免登录 |
| 园方大屏 | `pnpm dev:ops` | [localhost:5175](http://localhost:5175/) | 运行指标、趋势和任务展示，免登录只读 |
| 手机游客端 | `pnpm dev:mobile` | [localhost:5176](http://localhost:5176/) | H5 导览、注册预约、扫码识景、聊天室与 AI 问答 |
| 前线处置终端 | `pnpm dev:gate` | [localhost:5177](http://localhost:5177/) | 员工领取任务、申请与撤回 OA、反馈完成 |
| 演示控制端 | `pnpm dev:demo` | [localhost:5178](http://localhost:5178/) | 管理员切换运行、控制时间、注入事件与模拟到离场 |
| 管理员后台 | `pnpm dev:admin` | [localhost:5179](http://localhost:5179/) | 内容、订单、设施、OA 审批、审核与服务状态 |
| 测试面板 | `pnpm dev:testing` | [localhost:5180](http://localhost:5180/) | 通用系统配置、API 验证、阶梯压测、延迟观测与报告 |
| 统一后端 | `pnpm dev:server` | [localhost:8787/api/v1/health/ready](http://localhost:8787/api/v1/health/ready) | API、WebSocket、仿真、持久化与 AI 服务 |

本地前端代理 `/api` 与 `/ws` 到 `127.0.0.1:8787`。后端 `/api/v1/health/live` 检查进程存活，`/api/v1/health/ready` 检查数据库、schema、可写主库和选中运行。

演示播种账号：管理员 `admin01`–`admin02`、员工 `staff01`–`staff03`、游客 `visitor01`–`visitor05`，初始密码均为 `123456`；已迁移账号保留原密码。游客也可自行注册。

服务测试工作台可单独启动，无需数据库，支持保存和切换不同被测系统。接口异常时自动接续备用数据；压测展示递增负载、吞吐量和延迟波动，支持手动升档，原始观测保留在详情及 JSON 报告。使用与验证见 [测试面板说明](apps/testing/README.md)。

## 当前能力与边界

- 六端共享当前运行，支持独立回放、运行切换与时间控制；写请求使用幂等键及记录版本检查，提交后通过 WebSocket 通知客户端刷新。
- 预约、任务、OA、公告、内容和账号由统一后端管理。模拟员工可自动领取和处理告警任务，OA 仍由管理员审批，待审批 OA 会阻止结案。
- 客流按客群路线推进，园区提供 89 个模拟遥感设备；区域热力与后端状态共用阈值。完整高拟真校准、细场景事件和部分排队/返程模型仍有欠项。
- 手机端同源构建 H5 与微信小程序；景点二维码用于识景。正式微信、真机相机及公网实扫仍待验收。
- 已接入文字问答、聊天生成与审核能力；完整知识发布隔离、RAG、会话管理及模型端到端验收仍需补齐。

## 验证与构建

数据库测试需要独立测试库 `scenic_test`。单元测试可通过 `TEST_DATABASE_URL` 指定连接串，默认是 `postgresql://aiden@127.0.0.1/scenic_test`；数据库测试使用临时 schema。浏览器测试需先安装 Chromium，部分 Playwright 配置仍写有本机测试连接串，换机器运行前应检查对应配置。

```sh
pnpm exec playwright install chromium

pnpm test                          # 工作区单元测试（包含数据库测试）
pnpm test:platform                 # 平台业务单元测试
pnpm typecheck
pnpm --filter @scenic/server typecheck
pnpm typecheck:mobile
pnpm typecheck:gate

pnpm exec playwright test --config playwright.platform.config.ts
```

各端另有 `pnpm test:e2e`、`pnpm test:ops`、`pnpm test:admin`、`pnpm test:mobile` 和 `pnpm test:gate`；共享组件使用 `pnpm test:ui`，前线接口静态检查使用 `pnpm check:gate-api`。

```sh
pnpm build                         # 游客大屏
pnpm build:ops
pnpm build:admin
pnpm build:gate
pnpm build:demo
pnpm build:testing                 # 独立测试面板
pnpm build:mobile                  # H5 与微信小程序
```

手机端构建产物位于 `apps/mobile/dist/build/h5` 和 `apps/mobile/dist/build/mp-weixin`。历史验证结果与测试范围见[联调记录](docs/implementation/PG迁移与本地联调-2026-09-13.md)；现场持续运行与完整并发、断线重放验收仍需完成。

## 目录与辅助工具

| 目录 | 用途 |
| --- | --- |
| `apps/` | 六个前端与统一后端；业务实现集中于 `apps/server/src/platform` |
| `packages/` | `contracts` 接口类型、`client` 客户端、`scenic` 地图路网、`ui` 组件与 `scroll` 滚动能力 |
| `assets/` | 共享资源及景点二维码 |
| `docs/` | 设计方案、接口、实施与验收记录、部署材料和历史归档 |
| `infra/` | 前后端镜像、Compose 联调、内网 K8s 与公网入口配置模板 |
| `scripts/` | 本地服务启动、地图/美术/二维码导出与历史数据归档脚本 |
| `experiments/` | 独立视觉效果实验 |
| `.local/` | 本机截图、报告、备份等临时产物，不进入版本控制 |

常用辅助命令：`pnpm dev:ui` 预览共享组件，`pnpm assets:scenic-art` 导出景区美术资源，`pnpm assets:qr` 生成并解码校验景点二维码。手机地图与路线资源可运行 `pnpm --filter @scenic/mobile assets` 更新。

## 部署与文档入口

目标部署为六个独立前端、单活动 Node.js 后端及内网 PostgreSQL 主备，正式业务运行于内网 K8s。Compose 仅用于联调；香港主入口和既有 VPS 备用入口指向同一内网业务，穿透方案待定，域名使用 `starhusk.com`。现有模板不代表镜像已实际启动或生产环境已部署。

- [文档索引](docs/README.md)：产品、数据、视觉、接口与历史资料。
- [智慧景区测试驱动开发工作流 · 产品方案](docs/智慧景区测试驱动开发工作流-产品方案.md)：面向竞赛评审的产品定位、超写实数据生成器、六端协作与测试驱动交付闭环。
- [PG 迁移与本地联调记录](docs/implementation/PG迁移与本地联调-2026-09-13.md)：当前数据库、设备、人流与并发修订。
- [六端当前接口与交付记录](docs/implementation/六端当前接口与交付记录.md)：业务接口、数据分工和未完成项；其中旧 SQLite 描述以 PG 联调记录为准。
- [工作区与容器编排架构](docs/工作区与容器编排架构-V1.0.md)及[部署模板说明](infra/README.md)：部署拓扑与目录约定。
- [部署操作材料](docs/部署操作材料-V1.0.md)、[部署前极简清单](docs/部署前极简确认清单.md)及[部署材料校验记录](docs/部署材料校验记录.md)：环境准备与发布步骤。
- [部署后人工测试清单](docs/智慧景区部署后人工测试清单.md)：现场逐端和跨端验收。
