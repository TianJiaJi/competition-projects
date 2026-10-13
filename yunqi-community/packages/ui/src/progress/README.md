# 公共加载屏与水墨进度条

`ScenicLoadingScreen` 是默认完整加载界面，统一山形标志、景区标题、横贯屏幕的水墨线、百分比及准备状态。

```vue
<ScenicLoadingScreen :progress="resourceProgress" @complete="revealContent" />
```

可选参数：`progress`（0–100）、`title`（青岚山境）、`message`（正在构建沙盘与卷轴）、`label`（景区加载进度）、`theme`（light／dark，默认 light）。使用固定全屏布局，仅左右各留16px。完成文字自动切换为“准备就绪”。宿主负责显示隐藏和真实准备进度；组件不会伪造计时进度。

`InkProgress` 仍可用于单独嵌入进度线；`complete` 在首次100%后的300ms墨线过渡结束时触发，减少动态效果时直接完成。

园方与导览端默认共用完整加载屏。园方汇总字体、四张图表与 GPU 准备后到100%，再包围式入场；导览依旧由模型/GPU准备驱动原卷轴开场，不改变加载门槛。
