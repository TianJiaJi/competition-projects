# 园方运行监控

Vue 3 + Three.js + ECharts 的完整 Mock 原型。使用共享沙盘、人流热力、区域标签、玻璃、气泡和等高线背景。

- `pnpm dev:ops`：http://localhost:5175/
- http://localhost:5175/?preview=1：手动切换六种样例快照。
- `pnpm build:ops`、`pnpm test:ops`。

默认 2026-09-12 14:30，5461 人在园、8236 人累计入园、288 个余位、7 条未完成告警。所有数据集中于 src/mock.ts；没有真实连接、派单或结案操作。前线终端与人脸识别本轮不实现。

详见 [园方大屏实现说明](../../docs/园方大屏实现说明-V1.0.md)。

后端开发从[数据清单与对接约定](../../docs/园方大屏数据清单与后端对接约定-V1.0.md)开始；完整场景与静态 ID 见[2026-09-12 归档](../../docs/archive/园方大屏-2026-09-12/README.md)。运行 `node scripts/archive-ops-data.mjs <输出目录>` 可从工作区根目录重新导出当前数据。归档不是生产 HTTP 响应。
