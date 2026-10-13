# 公共三维卷轴

`@scenic/scroll` 不依赖景区、路网、业务数据或游客页面。它管理宣纸、装裱、木轴、展开几何、纸面柔波和开场时间轴。任意 Three.js 场景均可使用。

```ts
import { createScrollModel, createIntroTimeline } from '@scenic/scroll';

const scroll = createScrollModel(scene, {
  width: 100, depth: 78, y: -26,
  center: { x: 0, z: 2 },
  painting: artworkTexture,
});
const timeline = createIntroTimeline(true);
// 在宿主现有 RAF 中调用；dt 是可见页面的经过秒数。
const frame = timeline.advance(dt, contentReady, reducedMotion, document.hidden);
scroll.update({
  opening: frame.open,
  opacity: 1,
  ink: 1 - frame.rise * .88,
  time: paperElapsed,
  azimuth: cameraAzimuth,
});
// 卸载时：
scroll.dispose();
```

- `painting` 是可选的外部纹理，也可用 `setPainting(texture)` 更新；由调用者释放。图案从最初就印在纸上，展开时按纸面位置逐段露出，不缩放图案。
- `opening`、`opacity`、`ink` 为 0–1；`time` 是纸面动效的秒数，宿主在隐藏/减少动态效果时冻结。纸面随风鼓起和下垂，两侧木轴错时起落，启动柔和缓入；整卷保持小幅升沉。
- `azimuth` 是绕 Y 轴的世界朝向。相机绕场景旋转时传入相机方位角，可保持卷面相对观众朝向不变；固定机位时也可使用常量。
- 纸面相对木轴连线的柔波最大约 ±1.95，靠近木轴衰减到零。两端随木轴升沉，波动沿纸面传播；100 × 78 配置的整体最高点变化小于 5.3 单位，游客沙盘预留 6 单位净空。
- 时间轴总长约 6 秒；模型未准备好时保持 loading 和 0 秒，宿主完成几何、纹理及 GPU 首帧预热后才开始完整展开，额外等待不计入动画。`fail()` 终止开场；减少动态效果直接显示最终静态状态。
- 组件不创建渲染器、不修改相机、不注册全局事件，不包含景区点位和专属墨画。景区图案位于 `@scenic/scenic` 的 `scroll-painting.ts`，运镜和沙盘空间衔接由该场景调用方管理。

Vue 宿主可以使用 `@scenic/ui/scroll` 的 `ScrollPresentation`，传入 `state` 并把画布放在默认插槽。它提供开场输入遮罩、水墨百分比进度和状态属性。外围界面应根据同一状态设置 `inert`，只在 `ready` / `failed` 后开放操作。

游客端将卷轴放在沙盘下方的固定世界平面，朝向使用初始机位方位角常量，与沙盘共用相机，不随镜头单独移动、缩放或转向；沙盘使用独立旋转组在卷轴上方转动，单纯自转或拖动不改变卷轴的屏幕朝向；详情平移和缩放时卷轴自然产生同一透视下的视觉变化。卷轴在独立背景场景渲染，清空背景深度后才绘制沙盘与云雾。`ScrollPresentation` 可接收 `progress`（0—100）显示两侧水墨进度条；进度由宿主真实准备阶段提供。
