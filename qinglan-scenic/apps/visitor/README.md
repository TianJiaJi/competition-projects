# 游客导览终端（前端归档）

负责公共三维导览、景点和设施查询；不展示个人订单、内部预警或游客聊天记录。

已实现 Vue 3 + Three.js 游客大屏模拟原型。在仓库根目录运行 `pnpm dev` 启动，`pnpm build` 构建到本目录的 `dist/`。

默认 `VITE_DATA_MODE=sample`，页面标注“演示数据”。配置 `VITE_DATA_MODE=live` 后使用同源 `/api/public/snapshot` 和 `/ws`，连接失败不回退样例数据；服务端本轮未实施。

手机端未实施。大屏仅保留二维码参数生成能力；默认不配置 `VITE_MOBILE_URL`，不生成指向不存在页面的二维码。未来有独立手机导览后再配置该地址。

完整约定见 [架构方案](../../docs/工作区与容器编排架构-V1.0.md)及[原型实现说明](../../docs/游客大屏原型实现说明-V1.0.md)。

当前 UI、四种展示模式及 `terminalId` 配置见 [游客端 UI 与终端导览](../../docs/游客端UI与终端导览.md)。

## 更换当前终端

在浏览器地址栏修改网址中的 `terminalId`，按回车重新加载页面即可切换。参数名及编号区分大小写；每个网址只保留一个 `terminalId`。测试和生产使用同一规则，无需修改代码、环境变量或重新构建。

| 终端位置 | `terminalId` 参数值 | 本机预览地址 |
| --- | --- | --- |
| 入口广场 | `terminal-entry` | [切换到入口终端](http://localhost:5173/?terminalId=terminal-entry&alwaysOpen=1) |
| 竹间驿附近 | `terminal-bamboo` | [切换到竹间驿终端](http://localhost:5173/?terminalId=terminal-bamboo&alwaysOpen=1) |
| 山顶平台 | `terminal-summit` | [切换到山顶终端](http://localhost:5173/?terminalId=terminal-summit&alwaysOpen=1) |
| 归云集附近 | `terminal-market` | [切换到归云集终端](http://localhost:5173/?terminalId=terminal-market&alwaysOpen=1) |

例如，山顶终端使用 `http://localhost:5173/?terminalId=terminal-summit&alwaysOpen=1`。部署后将 `http://localhost:5173/` 换成实际游客端访问地址，保留 `terminalId=terminal-summit` 即可。上述链接中的 `alwaysOpen=1` 只用于演示常开，生产定位不需要它。

网址尚无查询参数时用 `?terminalId=...`；已有其他查询参数时用 `&terminalId=...`；已有 `terminalId` 时直接替换其值，不重复追加。

切换并加载后，页面固定进入“游览”，对应终端显示放大的“我在这里”胶囊，新导览默认从该终端出发。手动修改路线起点、点击其他终端详情均不会更换当前设备定位；要更换定位仍需修改网址并加载。两分钟空闲重置后，路线起点回到网址指定的终端。

未传 `terminalId` 默认入口终端；空值或无效编号会提示“终端编号无效，已使用入口终端”，并使用入口终端。

## 2026-09-11 归档

已归档四模式沙盘、四台网址终端、设施详情运镜与单连线、男女及无障碍卫生间资源数据、索道容量与排队，以及公共玻璃组件。完整的数据、字段、文案与交互口径见 [子项目数据清单](docs/数据清单与交互约定.md)，该目录同时保存全部点位路网及固定时刻公开快照。

卫生间配置归档在 [数值设计总文档 §6.2](../../docs/景区24小时数据与数值仿真设计方案-V1.0.md#62-卫生间容量分项占用与负载)，索道新数值归档在同文档 §6.3。子项目引用这些规则，避免重复维护物理配置。

演示入口：`http://localhost:5173/?terminalId=terminal-entry&alwaysOpen=1`。预览端口 5173 与公共组件预览 5174 应保持运行，验证脚本复用已有进程。

## 触屏电脑与平板

2026-09-12 补充单指交互、平板布局、页面缩放拦截、卡片可读性、固定游览旋转中心与开场预热。使用规则、浏览器限制和验证范围见 [触屏适配与验收](docs/触屏适配与验收.md)。
