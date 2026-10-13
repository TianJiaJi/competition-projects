# 上游来源与本地修改

- Web 移植项目：[martin65536/liquid-glass-webgl](https://github.com/martin65536/liquid-glass-webgl)
- 固定提交：`b4e0a6910443cea7cdd4b1bfcf7b2394e0a15e48`
- 获取日期：2026-09-11
- 原始 Android 项目：[Kyant0/AndroidLiquidGlass](https://github.com/Kyant0/AndroidLiquidGlass)
- 上游 Web 项目声明由 Z.ai Agent 辅助完成。
- 许可证：Apache-2.0，原文保留在 [LICENSE](LICENSE)。请在再分发时保留来源、许可证与修改说明。

本目录保留上游 `src/components/liquid-glass/renderer/index.ts` 的本地 TypeScript 导入依赖闭包（62 个源文件），未引入 React 宿主、Next.js 页面、后台、设置界面或上游图像资源。Vue 包装器、DOM 按钮、参数转换、降级和示例由当前项目实现。相邻 `renderer-adapter.ts` 的纹理上传流程改编自上游 `methods-wallpaper.ts`，由 Vue 宿主管理加载取消和请求版本。

本地修改：

- `renderer/index.ts`：移除只对 React/Next.js 有意义的 `use client` 指令。
- `renderer/methods-toggle.ts`、`renderer/methods-render-glass-state.ts`：补齐与上游实际函数一致的类型参数声明。
- `renderer/methods-render-nonglass-plain-rect.ts`、`renderer/methods-render-nonglass-progressive-blur.ts`：在读取可选 spec 前检查存在性，兼容工作区 strict TypeScript。
- `renderer/methods-fbo.ts`：补齐调试统计必填字段；该路径未测量的分项耗时置零。
- `renderer/perf-monitor.ts`：移除对不存在的旧统计字段的赋值。
- `renderer/gl-utils.ts`：链接结束或失败后释放 shader 句柄。
- `renderer/methods-dispose.ts`：补充释放 dummy sampler 纹理。

上游内部算法不是当前项目独立原创。公开稳定入口为 `@scenic/ui/liquid-glass`，应用不应直接依赖本目录的内部方法。
