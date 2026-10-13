# 远端 Issues 修复方案

## Context

远端仓库 `qmgcbcAiden/qinglan-scenic-workspace` 当前有开放 Issue #2–#8。工作区已有未提交修改：#3（预约过期时段）已基本实现，#4（读请求全局串行化）已处理核心问题，#6/#7 仅部分修复；#2、#5 及 #8 的多数子问题仍未闭环。

本轮用户确认：

- 覆盖全部 #2–#8。
- 管理后台菜单的重叠布局很可能是刻意设计，保留现状，不按 Issue #8 的建议调整。
- 手机端已登录时显示“退出登录”。
- `/api/v1/runtime` 继续匿名公开，补充文档说明，不隐藏运行元数据。
- 未配置模型时审核任务直接进入终态，不进入重试队列。

## Approach

1. 先修演示主链路：修正随机告警和检修计划对点位类型的错误假设，使用现有真实点位类型或统一的设施候选规则，并对空候选集合返回明确的 4xx 业务错误。补回归测试，确认告警能进入前线工作区并完成处置。
2. 完善移动端会话和预约异常态：复用已有 `requireLogin`、统一请求封装和服务端 `/auth/logout`；未登录预约读取触发登录引导，普通失败显示重试，不把未知余量当成 0；修正多设备同步文案。
3. 收紧 HTTP 输入边界：保留现有 `RequestBodyError` 和统一错误响应，补充登录字段长度及控制字符校验，确保非法 JSON、超大请求体、超长输入和 null 字节均返回客户端错误。
4. 完善低优先级项：分页参数严格拒绝越界，审核队列对 `MODEL_NOT_CONFIGURED` 直接终态、其他错误采用有限重试并避免无限积累；`runtime` 的匿名公开用途写入交付/接口文档；守恒测试超时与全局配置一致。
5. 保留 #3/#4 当前方向并做验证，不重复重构已有效的 `bookable` 和 `readTransaction` 方案。

## Files to modify

核心实现：

- `apps/server/src/platform/service.ts`：修复 `/demo/alerts` 和检修设施点位类型假设；保留并验证 `bookable`。
- `apps/server/src/platform/http.ts`：严格分页校验；维持统一错误响应；必要时补 runtime 行为注释。
- `apps/server/src/http.ts`：复用请求体错误类型和 400/413 映射。
- `apps/server/src/platform/store.ts`：登录用户名、密码长度与控制字符校验。
- `apps/server/src/platform/ai.ts`：模型未配置终态、有限重试及清理/保留策略。
- `apps/mobile/src/pages/booking/index.vue`：401 登录引导、加载失败态、过期时段展示和提交保护。
- `apps/mobile/src/pages/me/index.vue`：根据登录态显示“登录 / 注册”或“退出登录”。
- `apps/mobile/src/services/platform.ts`：新增登出请求和本地状态清理。
- `apps/mobile/src/pages/orders/index.vue`：改为账号级、多设备同步文案。
- `docs/implementation/六端当前接口与交付记录.md`、相关接口文档：说明 `/runtime` 匿名公开及本轮完成边界。
- `tests/unit/platform.test.ts`：把硬编码 20 秒守恒测试调整为与项目配置一致。

测试与验证文件：

- `tests/unit/platform-http.test.ts`
- `tests/unit/postgres-concurrency.test.ts`
- `tests/unit/simulation-clock.test.ts`
- `tests/unit/platform.test.ts`
- 现有移动端/平台端 Vitest 测试文件
- 相关 Playwright 测试或新增专项 fixture

明确不修改：

- 管理后台 `rr-sleeve` 菜单的尺寸、间距和重叠命中布局。该项作为用户确认的刻意设计保留，并在验收记录中标注。

## Reuse

- 服务端：`DomainError`、`RequestBodyError`、`assert`、`textField`、`integer`、统一 `respondError`。
- 移动端：`request`、`requireLogin`、`state`、`save`、`go`，以及已有 `runtime` 和 `refreshOrders`。
- 会话：服务端现有 `POST /auth/logout`、`store.authenticate` 和 token 摘要删除逻辑。
- 数据访问：写操作使用 `store.transaction`/幂等命令，纯读使用 `readTransaction`；不引入第二套事务或会话机制。
- 已有预约 `bookable` 字段、模拟员工/告警生命周期、测试 fixtures、Vitest 和 Playwright 配置。

## Steps

- [x] 修复 #2 的随机告警点位选择、检修点位校验和空集合保护。
- [x] 完善 #5：手机端按登录态显示退出，退出后撤销服务端会话并清空本地个人状态。
- [x] 完善 #6：预约配额请求区分 401/普通错误，未登录走登录页，未知状态不显示余 0。
- [x] 完善 #7：严格处理请求体异常、登录长度和控制字符，补畸形输入测试。
- [x] 完善 #8：严格分页、同步文案、审核有限重试/runtime 文档/守恒超时；保留菜单布局。
- [x] 对 #3 当前过期时段实现补齐接口和浏览器回归验证。
- [x] 对 #4 当前读写事务分离执行并发和一致性验证。
- [x] 更新当前交付记录，区分已完成、仍部分完成和真实环境延期项。
- [x] 执行定向单测、接口测试、浏览器测试、类型检查和相关端构建。

## Verification

- #2：`POST /api/v1/demo/alerts` 返回成功；新任务出现在 `/tasks`、`/gate/workspace` 和园方数据中；前线开始/完成后状态、记录和 OA 约束正确。
- #3：今天已结束时段不可选并显示明确状态，未来时段可选；服务端仍拒绝绕过前端的过期提交；配额读取失败显示错误/重试而非余 0。
- #4：写事务占用期间纯读请求仍可完成；并发梯度不再被单一写队列锁死；幂等、超卖、版本竞争和快照一致性继续通过。
- #5：游客登录后“我的”页面出现退出操作；退出后 token 失效，`aiSession`、运行缓存、订单、消息、会话和游览状态清空；再次访问个人功能要求登录。
- #6：匿名打开预约页显示登录引导并跳转登录；网络异常提供重试；真实配额为 0 时仍显示 0。
- #7：非法 JSON 返回 400，超过 80KB 返回 413，超长用户名/密码和 null 字节返回 400，正常登录不受影响。
- #8：`page < 1`、`pageSize < 1`、非整数和超过上限返回 400；两处同步文案一致；runtime 文档明确公开字段用途；模型未配置不产生可重试任务，临时错误达到上限后终态；守恒测试不因固定 20 秒阈值失败；菜单视觉保持现状。
- 运行相关 Vitest、Playwright、服务端类型检查和涉及前端生产构建；记录未验证的真实模型、真机、生产部署和公网环境风险。
