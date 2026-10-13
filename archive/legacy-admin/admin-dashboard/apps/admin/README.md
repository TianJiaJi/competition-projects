> 当前在线入口：http://localhost:5179，启动 `pnpm dev:admin`。保留原 App.vue 界面并连接8787统一后端；账号admin01/admin02，密码123456。5174简化版已删除，旧本地模拟数据不自动导入。当前接口和验收见[六端交付记录](../../docs/implementation/六端当前接口与交付记录.md)。下文旧Mock说明保留供原型追溯，不再描述默认在线行为。

# 管理员后台（apps/admin）

青岚山境后台管理 **本地 Mock 原型**：所有业务在本浏览器内完成，不连接真实后端，不修改游客端或园方端数据。
产品需求见 [管理员后台前端需求文档 V1.0](../../docs/管理员后台前端需求文档-V1.0.md)，
给后端开发者的接口设计见 [管理员后台接口文档 V1.0](docs/管理员后台接口文档-V1.0.md)。

## 启动与校验

```bash
pnpm install                 # 工作区依赖
pnpm dev:admin               # 开发服务器 http://localhost:5176（strictPort）
pnpm build:admin             # 生产构建
pnpm test:admin              # 单元测试（vitest）+ 浏览器测试（Playwright）
pnpm typecheck               # 全仓 vue-tsc（含本应用）
```

浏览器测试会启动当前工作区的独立服务器，不复用已有预览；5176 被占用时可用 `ADMIN_E2E_PORT=5187 pnpm test:admin` 指定测试端口（Windows PowerShell 先执行 `$env:ADMIN_E2E_PORT="5187"`）。

只启动本应用也可以：`pnpm --filter @scenic/admin dev`。端口冲突时 Vite 会直接报错退出，不终止其他应用的预览。

浏览器测试默认使用本机 Chrome（`channel: chrome`），不需要下载 Playwright 自带的 Chromium：

```bash
ADMIN_E2E_CHANNEL=chromium pnpm test:admin        # 需先 npx playwright install chromium
ADMIN_E2E_EXECUTABLE=/path/to/chrome pnpm test:admin  # 指定具体浏览器可执行文件
```

当前交付入口：[管理员终端归档与对接说明](docs/归档与对接说明-2026-09-13.md)。历史功能修复见 [审查修复验收记录](docs/审查修复验收记录-2026-09-13.md)。

## 本地演示账号

| 账号 | 密码 | 说明 |
| --- | --- | --- |
| `admin_demo` | `AdminDemo123!` | 公开样例账号，仅在登录页与本文档出现 |

- 密码不写入 `localStorage`；模拟会话只保存到本标签的 `sessionStorage`，有效期 **12 个真实小时**，关闭标签后需重新登录。
- 该账号与密码**不能作为生产凭证**，真实版本由 Cookie 会话与后端鉴权负责。

## 存储与数据

| 键 | 内容 |
| --- | --- |
| `qinglan.admin.mock.v1` | 业务数据：全局内容 + 按 runId 分区的运行数据、revision |
| `qinglan.admin.mock.session.v1` | 员工模拟会话与真实到期时间（sessionStorage） |
| `qinglan.admin.appearance` | system/light/dark 外观偏好（localStorage，不属于业务数据） |

- 固定业务时间 `2026-09-12T14:30:00+08:00`，默认运行 `run_admin_mock_20260912`；同一业务时刻的多次保存通过 revision 与真实记录时间区分。
- 页面只调用 `src/services/**` 的异步业务服务，不直接读写 localStorage；写入成功后才更新页面内存，写入失败保留旧数据与草稿。
- 全程不使用 `localStorage.clear()`；恢复样例仅覆盖后台自己的业务键，写入成功后再替换内存，失败保留原数据。
- 检测其他标签的业务存储变化后提示重新加载，并拒绝继续保存及恢复样例；当前草稿仍保留。每次写入前再次核对持久化快照，覆盖同 revision 重建与删除业务键的情况。
- 新增文章或公告时，“发布”在一次保存中完成创建与发布；失败保留输入，重试不会留下重复草稿。
- 本地数据按完整嵌套结构校验；缺少必需集合、当前运行或嵌套字段时显示恢复提示，不进入无法完成的初始化。
- 顶部“账号菜单 → 重置数据”会重建本期后台业务状态与界面缓存，**保留当前员工会话**，不触碰游客端与园方端数据。

## 页面与路由（hash 路由）

`#/login`、`#/overview`、`#/content/scenic`、`#/content/articles`（`/new`、`/:id/edit`）、`#/content/pois`（`/:id/edit`）、
`#/notices`、`#/orders`、`#/booking/slots`、`#/facilities`、`#/inspections`、`#/alerts`、`#/users/visitors`、`#/users/staff`、`#/chat`、`#/knowledge`、`#/service-status`。
旧 `#/users` 兼容进入游客管理；游客与员工使用独立筛选缓存。未知路由显示返回工作台入口。

## 本期范围与未实现项

- 已实现：15 个业务模块（游客／员工拆分为独立页面）、Mock 数据与本地持久化、订单取消／改期与配额的原子保存、配额调整、全类别设施状态、卫生间分项暂停（§4.3）、
  检修计划到期去重生成、只读告警、用户禁用、聊天撤回／举报／禁言、知识只读、服务状态样例。
- **未实现（精简范围）**：`?preview=1` 开发预览入口与加载／失败／超时／存储损坏等注入场景、
  第二 runId 夹具与运行切换、24 篇资讯与 30 条订单的全量种子、真实 HTTP/WebSocket、跨端联动、部署与设备控制。
  失败与降级路径由服务层分支与单元测试覆盖，界面保留加载/空数据/失败重试与字段错误状态。

## 服务状态专项（2026-09-13）

`#/service-status` 使用七模块节点健康环，上方为后端服务和园区遥感设备，下方为五个应用端。复用工作台的玻璃材质、标题层级和深浅主题；本期仅面向 PC 宽屏，验收 1366×768、1440×900、1920×1080。环体直接复用公共玻璃组件，参考预览第 3 款品牌色，浅色采用 42% 底色、2px 背景模糊及轻薄边缘；深色分别以青绿 52%、珊瑚红 62%、中性灰 32% 区分健康、异常与未知。页面仅展示模块名、百分比、状态数量、检测时间及读取时间；不显示描述小字、数据来源说明，也没有明细或运维操作。

`getServiceStatus` 当前仍为固定 Mock 适配器，真实后端未实现；后续 `GET /api/v1/admin/service-status` 返回 `{ source, checkedAt, modules }`，模块包含健康、异常、未知计数与检测时间。详见[接口文档 §3.15](docs/管理员后台接口文档-V1.0.md#315-服务状态)。不依赖业务时钟，刷新不会随机变化或推进检测时间；失败保留上次成功结果。

专项验证：`pnpm --filter @scenic/admin test tests/unit/service-health.test.ts`；`ADMIN_E2E_PORT=5187 pnpm exec playwright test --config playwright.admin.config.ts apps/admin/tests/e2e/admin-service-status.spec.ts`。

## 目录结构

```
src/
  app/        会话、提示、确认弹窗、未保存守卫与展示格式化
  components/ 自建后台控件（表格分页、表单、标签、抽屉、确认、提示等）
  core/       时间口径、存储适配、类型、校验、配额/卫生间/通路等业务规则
  mock/       共享设施目录、全局与运行种子、检修生成
  services/   异步业务服务边界（未来替换为 HTTP 适配层）
  pages/      15 个业务页面
tests/
  unit/       业务规则单元测试（vitest）
  e2e/        Playwright 浏览器测试与验收截图脚本
docs/         接口文档与验收截图产物
```
