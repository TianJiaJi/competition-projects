# 共享视觉基础

保存视觉变量和基础组件；业务页面与专用交互流程留在应用内。

已实现共享主题、景区沙盘与液态玻璃按钮。业务页面与数据订阅由宿主管理。

- `@scenic/ui/theme.css`：共享视觉变量与基础样式。
- `@scenic/ui/contour`：`ContourBackground` 低对比度等高线背景，支持全幅连续纹理、三种地形取景、浅深主题和容器适配，见 [使用说明](src/contour/README.md)。运行 `pnpm dev:ui` 后访问 `/contour.html` 预览。
- `@scenic/ui/scenic`：公共沙盘、景点信息和详情气泡，见 [沙盘使用说明](src/scenic/README.md)。
- `@scenic/ui/liquid-glass`：`LiquidGlassScene`、`LiquidGlassSurface` 与 `LiquidGlassButton`，默认 **14px 圆角、2px 轻模糊、18% 底色浓度**，使用 CSS 通透玻璃，无 WebGL 渲染器，见 [公共组件文档](../../docs/液态玻璃公共组件-V1.0.md)。

运行 `pnpm dev:ui` 打开独立按钮预览。按钮可独立放在页面上，由浏览器对其背后的实际内容做局部 CSS 模糊；`LiquidGlassScene` 只是可选背景容器。

完整目录约定见 [架构方案](../../docs/工作区与容器编排架构-V1.0.md)。

- `@scenic/ui/scroll`：独立的 `ScrollPresentation`，配套 `@scenic/scroll` 三维卷轴、纸面柔波与开场时序，见 [卷轴组件文档](../scroll/README.md)。
- `@scenic/ui/scenic-svg`：`ScenicSvgMap` 与 SVG 导出函数，青绿轻水墨景区底图，共享路网/水系/点位标识；游客卷轴复用同一张图，见 [SVG 地图文档](src/scenic-svg/README.md)。

- `@scenic/ui/progress`：独立 `InkProgress` 水墨进度条，提供 progress、label 和 complete，游客/园方复用，见 [说明](src/progress/README.md)。
- `@scenic/ui/charts`：共享 ECharts SVG 渲染容器、青绿主题与选择事件，业务配置由宿主提供。

### 宿主主题扩展

玻璃材质支持继承 `--glass-tint-rgb`、`--glass-text-color`、`--glass-border`、`--glass-border-bottom`、`--glass-highlight-start`、`--glass-highlight-middle`、`--glass-highlight-end`、`--glass-shadow`。不设置时保持原浅色参数；圆角、模糊和底色透明度仍由组件 props 控制。

图表导出 `getChartTheme('dark' | 'light')`，返回配色、文字、网格和 tooltip 样式；原有 `chartColors`、`chartText`、`chartGridLine` 保持浅色兼容。园方仅在自己的根容器设置主题，不影响游客和公共预览。

沙盘可选 `regionLabels` 提供固定侧壁位置投影，宿主渲染屏幕正向玻璃容器；`focusRightInset` 预留详情面板空间。默认不启用这些投影。公共 progress 导出默认完整加载屏 `ScenicLoadingScreen`，两端共用。
