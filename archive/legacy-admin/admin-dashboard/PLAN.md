# 倍速模拟数据生成与后续修改计划

## Context

当前项目的“倍速模拟”是回放运行（`mode=replay`）的业务时钟加速，不是把某个实时人数值简单乘以倍速。

当前链路：

1. 演示控制端在 `apps/demo/src/App.vue` 调用 `POST /demo/clock`，设置 `speed=1/5/30/60`，或设置暂停/继续。
2. 服务端在 `apps/server/src/platform/service.ts` 保存 `anchorReal`、`anchorBusiness`、`paused`、`speed`。
3. `tick()` 每秒检查当前运行。回放未暂停时，目标业务时间约为：
   `anchorBusiness + (Date.now() - anchorReal) * speed`。
4. 服务端最多每次把仿真推进 60 秒业务时间，并以 10 秒为一个仿真步长调用 `simulation.step()`。
5. `step()` 使用确定性哈希种子和业务日期/时间生成：入园需求、车辆与大巴批次、停车占用、索道排队、卫生间占用释放、天气、区域人数、告警等。
6. 区域人数主要由 `apps/server/src/platform/visitor-flow.ts` 的公式模型计算：把实际入园人数累计到分钟桶，按路线、速度档位和游览阶段计算占用核；再将结果按最大余数法分配为整数区域人数。
7. 最多生成 320 个“代表游客点”用于地图展示；这些点是统计质量的可视化抽样，不代表真实游客个体，也不参与人数守恒。
8. 快照读取时重新生成代表点位置和轨迹，因此同一运行、同一业务时间下结果应可复现。

当前已知特征/限制：

- 回放创建时默认暂停；点击继续后才推进。
- 速度只影响业务时间流逝，不改变公式中的需求总量、路线权重和游览时长。
- `demandScale` 影响后续模拟入园需求；`botMax` 影响模拟游客聊天频率，不等同于客流倍速。
- 每日入园量由 `arrivalPlan()` 按工作日/周末、固定权重、确定性噪声生成；17:00 停止入园。
- 游览结束后按路线时长公式离园；区域合计、在园人数和代表点均由同一套业务时间模型派生。
- 当前修改目标尚未确定。本计划暂不修改业务代码。

## Approach

先确认需求边界，再决定是否调整：

- 仅修正倍速控制与暂停/继续的时钟语义；
- 调整倍速下数据推进的平滑度、刷新频率或前端观感；
- 调整客流、设施、告警等公式，使其符合新的业务口径；
- 或者同时补齐测试、演示数据和跨端一致性验证。

原则上复用现有的 `POST /demo/clock`、`tick()`、`simulation.step()`、`visitorDistribution()` 和确定性 `U()`，避免为倍速另建一套数据生成逻辑。

## Files to modify

待需求确认后确定。预计可能涉及：

- `apps/demo/src/App.vue`
- `apps/server/src/platform/http.ts`
- `apps/server/src/platform/service.ts`
- `apps/server/src/platform/simulation.ts`
- `apps/server/src/platform/visitor-flow.ts`
- `tests/unit/simulation-clock.test.ts`
- `tests/unit/visitor-flow.test.ts`
- `tests/platform/consistency.spec.ts`
- 相关实现说明文档

## Reuse

- 回放时钟：`apps/server/src/platform/service.ts` 的 `createRun()`、`tick()`、`/demo/clock` 分支
- 仿真单步：`apps/server/src/platform/simulation.ts` 的 `step()`
- 公式客流：`apps/server/src/platform/visitor-flow.ts` 的 `createFormulaFlow()`、`recordAdmission()`、`formulaOccupancy()`、`visitorDistribution()`
- 确定性随机：`apps/server/src/platform/simulation.ts` 的 `U()`，以及 `visitor-flow.ts` 中的 `random()`
- 现有时钟/守恒测试：`tests/unit/simulation-clock.test.ts`、`tests/unit/visitor-flow.test.ts`

## Steps

- [ ] 确认倍速模拟希望达到的业务效果和验收口径
- [ ] 明确当前公式模型中哪些数据需要保留、调整或新增
- [ ] 根据确认结果细化文件、接口、数据结构和迁移策略
- [ ] 实现回放时钟或仿真公式调整
- [ ] 补充单元、接口、一致性和浏览器验证
- [ ] 更新实现说明和未完成项记录

## Verification

计划确认后至少验证：

- 回放在 1x、5x、30x、60x 下业务时间推进正确，暂停后不继续推进
- 相同场景、相同种子和相同业务时间可复现
- 人数、区域合计、停车、卫生间和索道状态满足现有守恒约束
- 快照、园方大屏、游客大屏、手机端和前线端读取同一运行时状态
- 倍速切换、跨日、向后跳时、重启恢复和异常中断行为符合约定
- 相关测试及构建通过

## 待用户确认

1. 你想解决的是“倍速运行时数据生成不符合预期”，还是先了解当前实现机制？
2. 倍速下你期望哪些数据随业务时间推进：仅客流，还是客流、停车、索道、卫生间、天气、告警、公告、模拟员工和聊天全部推进？
3. 你希望倍速代表“真实业务时间加速”，还是代表“单位现实时间内生成更多游客/事件，但业务时间仍较慢”？
4. 是否需要保留当前的确定性复现和人数守恒约束？
