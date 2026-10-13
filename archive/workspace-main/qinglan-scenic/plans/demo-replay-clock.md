# 演示终端回放时钟排查与修复计划

## Context
用户反馈回放不能倍速，演示似乎停在 10:00。已完成隔离浏览器复现、修复及回归验证。工作区已有 PLAN.md、客流相关文件及测试的未提交变更，本计划另存。

## Approach
优先复现并修复切换运行后 WebSocket 心跳把客户端控制目标退回旧运行的缺陷。服务端广播时同步连接的 runId，客户端不再让仅用于保活的 pong 改写运行选择；继续通过 runtime 和 invalidate 同步当前运行。保留暂停与倍速独立的现有语义。若回归测试证明仍有独立推进异常，再根据时钟响应、tick 与快照证据定位，避免预先修改模拟算法。

## 已确认的证据与待确认项
- apps/demo/src/App.vue：倍速按钮只发送 `{speed}`，继续按钮单独发送 `{paused:false}`；页面没有醒目的暂停状态，成功提示统一为“操作已保存”。
- apps/server/src/platform/service.ts：六种预置场景仍存在；工作日 10:00 是初始时间，不是唯一数据状态。新建、切换、重启的回放默认暂停；修改倍速不会解除暂停。模拟按 10 个业务秒一步推进。
- apps/server/src/platform/http.ts：每秒调用 tick，revision 变化后广播刷新；尚未发现定时器缺失。
- tests/unit/simulation-clock.test.ts：已有旧倍速结算、暂停余量、重启暂停测试，但缺少从演示页面继续播放及四档倍速实际推进的验证。
- 本机 8787 的 `/api/v1/runtime` 当前返回现场模式（realtime、paused=false、speed=1），业务时间为 2026-09-17 11:35 上海时间；与用户描述的 10:00 回放并非同一状态。没有执行切换、登录或写数据库操作。
- 用户已确认：访问本机 5178，点击“继续”之后仍不推进。因此默认暂停不能解释故障。
- 已确认代码缺陷：platform/http.ts 的 connection.runId 仅在建连时赋值，broadcast 发出新运行 ID 却不更新连接记录；心跳 pong 因而继续发送旧 ID。packages/client/src/platform.ts 对 invalidate 和 pong 都执行 runId 更新。切换后每 5 秒的心跳可将客户端请求目标退回旧运行，而且 pong 不触发页面刷新。此时按钮请求可能发给旧运行，随后 refresh/runtime 又让页面显示新运行，产生控制无效的表象。
- 已在隔离 Playwright 环境复现：新建回放后等待 5.5 秒，继续请求的 X-Run-Id 指向旧运行，断言失败；修复后相同测试通过，回放时间推进且大屏同步。未发现需要修改模拟计时算法的额外故障。
- 验证结果：simulation-clock、platform-http、platform-client-clock 共 8 个单测通过；演示回放浏览器回归通过；pnpm typecheck、pnpm build:demo、git diff --check 通过。客户端另覆盖旧 pong、重连及固定 runId 链接。

## Files to modify
- apps/server/src/platform/http.ts：广播当前运行时更新连接运行标识，保证后续心跳一致。
- packages/client/src/platform.ts：限定更新运行选择的消息来源，保持固定 runId 链接语义。
- tests/unit/platform-http.test.ts：补充切换后的广播/心跳一致性覆盖。
- tests/platform/six-end.spec.ts：新增演示端真实回放控制回归。
- apps/demo/src/App.vue：清楚显示暂停/播放中及当前倍速，便于识别操作结果。
- tests/unit/simulation-clock.test.ts：补充四档倍速和继续/暂停推进断言。暂不计划改动 service.ts 的计时算法。

## Reuse
- createPlatformClient 的 request/runtime/subscribe：packages/client/src/platform.ts。
- 服务端 advance、tick、/demo/clock：apps/server/src/platform/service.ts。
- tests/unit/simulation-clock.test.ts 和现有平台端到端测试。

## Steps
- [x] 检查代码与本机只读运行状态，确认用户已执行继续操作。
- [x] 在隔离测试环境保持 WebSocket 连接，从旧运行创建/选择工作日回放；等待至少一个心跳后点继续与倍速，记录 POST 的 X-Run-Id、响应及新旧运行时钟，先复现目标漂移。
- [x] 修复服务端连接元数据与客户端 pong 对运行选择的覆盖；保留固定运行链接和重连同步行为。
- [x] 显示明确的播放状态与速度，保持倍速不自动解除暂停。
- [x] 增加回归用例并运行相关检查；若控制目标正确而时间仍不动，依据失败用例检查 tick 错误和事务回滚后再确定补充修复。

## Verification
- 规划阶段只读；实施后使用现有 testStore 和平台 Playwright 隔离环境，不操作用户当前演示数据。
- 后端：旧连接切换运行后 invalidate 与后续 pong 均指向新运行；新运行继续后推进，旧运行不被按钮误操作。
- 时钟：用可控 Date.now 验证 1/5/30/60 倍速的业务时间增量，考虑 10 秒步长及 tick 单次最多追赶 60 业务秒；暂停不推进，切速结清旧时间且余量保留，重启仍暂停。
- 浏览器：保持页面连接，创建工作日回放，跨过心跳后继续、切换四档倍速；核对时间离开 10:00、revision 增长及公开大屏快照同步。覆盖暂停后继续、切换已有回放、连接重建。
- 执行相关 simulation-clock/platform-http 单测和演示端 Playwright 用例，以及 pnpm typecheck、pnpm build:demo。若受数据库或测试服务配置限制，明确报告未完成项，不用静态检查冒充复现。
