# 客流四色分级与细粒度热力图计划

## Context

当前客流状态只有 `quiet / moderate / busy / unknown` 三档业务负载加未知，区域判定和热力渲染使用的颜色与分段并不统一。用户希望改为“绿、蓝、黄、黄”四个可视等级，并让拥堵区域通常最多只有一两个点；同时当前热力图使用 256×256 的投影纹理和按区域中心的连续高斯叠加，空间分片较粗，需要拆细。

本次只规划客流状态与热力视觉链路，不修改后台菜单的重叠布局，也不改变人数守恒和客流公式本身。另确认 `Z8`“公共通行区”需要承载实际通行人数，而不是始终为 0；接入后仍必须保持各区域合计等于在园总人数。

## Approach

1. 将现有四态契约明确为四个展示等级：保留 `unknown` 作为数据未知态，同时把业务客流的三档扩展为四档。已确认命名为 `quiet / light / moderate / busy`，对应绿色=空闲、蓝色=较舒适、浅黄色=适中、深黄色=拥堵；`unknown` 独立使用灰色。
2. 把区域客流判定集中为共享阈值/函数，服务端初始化、运行中快照、重放路径和测试夹具全部复用，避免多处阈值漂移。阈值按区域容量计算，并采用更高的拥堵阈值，确保正常高峰只有极少数区域进入最高档。
3. 扩展客户端契约、状态标签、颜色 token 和所有地图/运营端的状态映射，区分区域客流颜色与安全设施可用性颜色，避免安全设施继续误用客流色阶。
4. 重做热力投影数据生成：保留 Three.js shader 和 `DataTexture` 结构，但将纹理分辨率提高并按更细网格生成；热力值由细网格内的区域/代表客流分布计算，而不是只依赖区域中心的粗高斯叠加。关闭区域遮罩也使用同一细网格。纹理分辨率、采样半径和颜色插值集中配置，便于性能调优。
5. 对游客端、运营端和共享组件做视觉回归，验证色阶、热力连续性、未知/关闭状态、移动端地图和低性能降级均保持可用。

## Files to modify

- `packages/contracts/src/index.ts`：扩展 `LoadLevel` 状态契约。
- `packages/scenic/src/data.ts` 或新增共享客流配置模块：维护四色等级、区域容量和热力空间参数；优先复用现有区域定义。
- `packages/scenic/src/heat.ts`：提高热力纹理分辨率，细化采样网格和颜色计算。
- `packages/scenic/src/view.ts`、`packages/scenic/src/index.ts`：统一客流标签/颜色导出（如现有映射位于这些入口）。
- `packages/ui/src/scenic/ScenicMap.vue`、`packages/ui/src/scenic/ScenicPointInfo.vue`：适配新状态标签、地图标记和区域展示。
- `packages/ui/src/theme.css`：增加四色客流颜色 token。
- `apps/server/src/platform/simulation.ts`：统一区域客流四档判定。
- `apps/server/src/platform/service.ts`：修正重放/派生快照的判定复用。
- `apps/ops/src/theme.css`、`apps/ops/src/App.vue`、`apps/ops/src/style.css`：运营端图例、区域标签和热力说明适配。
- `packages/client/testing/snapshot.ts`、`packages/client/testing/*sample.ts`、`tests/fixtures/ops.ts`：同步测试快照和夹具状态。
- `tests/unit/visitor-flow.test.ts`、`tests/unit/visitor-view.test.ts`、`tests/unit/client.test.ts`、`tests/e2e/visitor-flow.spec.ts`、`tests/e2e/visitor.spec.ts`：新增四档边界、未知态和渲染回归。

实际文件清单需在实现前再次确认导出位置，避免重复创建已有工具。

## Reuse

- 客流状态类型和公开快照：`packages/contracts/src/index.ts`。
- 当前区域容量和统一判定入口：`apps/server/src/platform/simulation.ts` 的 `regionCapacities`、`level()`。
- 运行中/重放派生快照：`apps/server/src/platform/service.ts`。
- 区域定义、半径和空间锚点：`packages/scenic/src/data.ts` 及 `regions` 导出。
- 当前 Three.js 热力纹理与 shader 注入：`packages/scenic/src/heat.ts` 的 `createHeatProjection()`。
- 地图状态显示：`packages/ui/src/scenic/ScenicMap.vue`、`ScenicPointInfo.vue`。
- 运营端热力模式和图例：`apps/ops/src/App.vue`、`apps/ops/src/style.css`。
- 现有未知/关闭优先级和客户端快照校验：`packages/client/src/index.ts`。

## Steps

- [x] 确认四种颜色的顺序和文字标签：空闲、较舒适、适中、拥堵对应绿、蓝、浅黄、深黄；unknown 保持灰色。
- [x] 盘点所有 `LoadLevel` 使用点，确定哪些是区域客流、哪些是停车/索道/卫生间负载，避免把四档区域阈值错误套到设施指标。
- [x] 定义共享四色状态配置、阈值和颜色 token；确认最高档的目标比例为正常时最多一两个区域。
- [x] 确认 `Z8` 公共通行区统计实际通行人数，不再保持固定 0；需要把通行阶段接入区域分配并保持总人数守恒。
- [x] 修改服务端模拟、重放派生和测试夹具，使所有客流快照使用同一四色判定。
- [x] 修改 contracts、共享标签与颜色映射，处理未知、关闭、维修和安全设施状态。
- [x] 将热力图从 256×256 提升到更细网格，重新设计区域影响/客流采样和遮罩计算，并保留 shader 的投影坐标约定。
- [x] 同步游客端与运营端热力图例、区域标签、点位颜色和详情文案。
- [x] 增加状态阈值、快照一致性、颜色映射、热力纹理非空及视觉回归测试。
- [x] 运行服务端/共享包类型检查、相关 Vitest、游客端与运营端 Playwright，以及移动端和运营端构建。

## Verification

- 四档区域状态在边界值前后稳定，所有服务端生成路径和夹具输出一致。
- 正常工作日/周末模拟下，最高客流档通常不超过一两个区域；高峰压测时仍能出现多个最高档，证明阈值没有被硬编码成永远不触发。
- `Z8` 在有游客通行时显示非零人数和对应热力，区域总人数仍与 `snapshot.visitors` 完全一致；无人在园时保持 0。
- 绿色、蓝色、两种黄色在区域标签、地图图钉、运营端图例和详情面板中语义一致；unknown/closed/maintenance 不被误判为客流颜色。
- 热力纹理尺寸和采样网格确实提高，地图有连续且更细的空间分片，不出现全图单色、明显方块边缘或关闭区域漏染。
- 热力更新仍能在连续快照下完成，低性能路径不会因纹理分辨率提高而出现空白、卡死或 WebGL 错误。
- 人数总量、区域合计、关闭区域和已有设施状态守恒测试继续通过。
- 运行 `git diff --check`、相关 Vitest、Playwright 和各应用 typecheck/build。

## Open questions

1. “绿蓝黄黄”四档具体想表达什么顺序？例如：绿色=舒适、蓝色=较舒适、黄色=适中、橙黄色=拥挤；还是蓝色表示未知/低温色，不参与客流强弱排序？
2. 两个黄色是否接受一个偏金黄、一个偏橙黄，以便在深浅和色相上可辨认？
3. 你说的“拥堵区域最多一两个点”是指正常演示时的默认工作日/周末，还是任何时刻都限制为最多两个？
4. 已确认热力图先做细网格平滑，不引入道路或代表游客密度模型。
5. 已确认 `Z8` 公共通行区承载独立的通行人数，并纳入区域总人数守恒。
