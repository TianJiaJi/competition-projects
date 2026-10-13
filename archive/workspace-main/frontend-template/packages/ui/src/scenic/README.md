# 公共景区沙盘

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ScenicMap } from '@scene/ui/scenic';
import type { PublicSnapshot } from '@scene/contracts';
defineProps<{ snapshot: PublicSnapshot }>();
const selected = ref<string | null>(null);
</script>

<template>
  <section style="position: relative; height: 680px">
    <ScenicMap
      :snapshot="snapshot"
      :heat="false"
      :selected="selected"
      :route="null"
      @select="selected = $event"
      @close="selected = null"
    />
  </section>
</template>
```

`ScenicMap` 包含体素地形、阶梯路网、湖水/瀑布、水墨云雾、索道、热力投影、点位图标、选中名称及默认详情气泡。所有资源由共享模型生成；不依赖游客端 CSS、图片路径、数据连接或页面布局。容器需要明确的高度，缩放与中心跟随容器尺寸，投影坐标相对于容器。

- 必填属性：`snapshot: PublicSnapshot`、`heat: boolean`、`selected: string | null`、`route: RouteResult | null`。
- 可选属性：`showToilets` 默认 `false`，`filter` 按点位类型过滤，`showDetails` 默认 `true`。
- 事件：`select(id)`、`close()`、`blank()`（点击未命中可见点位的沙盘）、`route(id)`、`return()`；业务页面接续处理路线等操作。`project(positions)` 提供点位投影，`performance(level)` 报告降级。
- 方法：通过组件 ref 调用 `zoom(factor)`（平滑缩放）、`focus(id)`（平滑居中放大所有点位）、`restoreFocus()`（恢复首次聚焦前的镜头）、`reset(preserveAngle?)`、`interact()`、`resume()`；只有直接操作沙盘会自动触发旋转暂停，外部 UI 操作不会。
- `#detail="{ point, snapshot }"` 可替换气泡内容；默认插槽提供 `projected`，可放入其它地图浮层。
- `ScenicPointInfo` 可单独复用点位状态、开放时间、服务、介绍及路线操作，`#handoff` 支持宿主页面补充内容，`imageUrl` 可选。
- `ScenicBubble` 复用与锚点关联的浮层、边缘避让、关闭/Escape 和焦点返回；`useScenicPopup` 供宿主自定义复杂浮层时共用定位逻辑。

游客大屏使用 `showDetails=false`，将公共 `ScenicPointInfo` 放入其统一查询浮层。两分钟空闲恢复、数据订阅、路线查询和页面导航仍由宿主管理。无需复制沙盘模型或水墨材质，也未实现手机端页面。

## 可选卷轴开场

`showScroll` 与 `intro` 均默认 `false`，现有调用保持兼容。游客大屏开启二者，并通过 `intro-state` 事件控制外围界面；状态为 `loading / opening / revealing / finishing / ready / failed`。在 `finishing` 开始淡入外围信息，到 `ready` 再解除输入锁定。

卷轴来自独立的 [`@scene/scroll`](../../../scroll/README.md) / `@scene/ui/scroll`，不写在沙盘模型内。开场以远景展示自带墨画的卷面展开，沙盘整体从纸面浮起，相机缓缓回到当前默认视角与大小；开场结束后卷轴保持朝向，纸面柔波叠加整卷轻微升沉与倾斜。沙盘浮起到位后平缓自转；默认镜头无需等待即持续旋转，拖动期间和点位聚焦期间暂停，松手或恢复默认镜头后立即继续。页面数据更新和空闲恢复均不重播；减少动态效果显示静态最终构图。

## 游览、人流、卫生间与安全

可传 `viewMode="default|crowd|toilet|safety"` 与 `currentTerminalId`。传入模式后取代旧的 heat/showToilets/filter 组合规则，图标和模型拾取统一筛选。当前终端始终显示“我在这里”胶囊。人流模式显示区域人数；卫生间及安全模式为目标模型着状态色，其他景物呈浅灰雾感，切回游览恢复原材质。`project` 的结果增加 `region-Z0` 等区域锚点。

游客端右侧面板不再使用 `useScenicPopup`；公共 `ScenicBubble` 仍可供其他宿主使用。完整行为见 [游客端说明](../../../../docs/模板替换指南.md)。

`ScenicPointInfo` 的卫生间详情读取可选的 `PointState.restroom`，分别展示女厕坐蹲位、男厕坐蹲位、小便位、无障碍间的总数、使用中、可用和排队；可展开全部服务位合计。合计包含小便位，不等于坐蹲坑位。缺失值显示“暂无数据”，不将服务能力或忙闲等级换算成坑位数。

`ScenicPointInfo` 的索道详情读取可选的 `PointState.cable`，展示方向候乘、预计等待、方向在途、全线容量、吊厢数与单厢容量、发车间隔及单程时间；未知显示暂无数据，关闭显示暂停登乘。容量和演示规则以数值设计总文档 §6.3 为准。

2026-09-12：`reset()` 与缩放同样使用平滑过渡；详情中心可临时变化，返回中途被手势打断时仍恢复固定游览中心 `[0,2,2]`。卷轴作为沙盘下方的真实世界平面，共享相机并使用独立背景渲染层；固定世界朝向、基准位置和尺寸，取消镜头位置／尺寸补偿。沙盘独立模型旋转组实现磁悬浮摆件效果，自转及拖动不再让相机绕卷轴转动；详情平移、缩放仍自然改变卷轴屏幕投影，不遮挡前景云雾。开场先完成构建与 GPU 首帧预热再播放，loading 阶段时间轴为 0。人流标签复用 `LiquidGlassSurface` 第 4 款；终端可见胶囊与所有点位圆标统一为 36px 高，外层保留 56px 透明触摸热区。

准备阶段使用左右向中间延伸的水墨进度条及中央百分比，进度来自实际构建、编译和首帧预热阶段；不再显示旧加载提示文本。

沙盘“未开放”提示（包括选中关闭点位后的名称／未开放组合框）采用公共 `LiquidGlassSurface` 第 4 款：9% 底色、2px 模糊、14px 圆角。

## 园方可选覆盖层（2026-09-12）

`showPointMarkers` 与 `enablePointPicking` 默认 true；园方传 false 隐藏导览标记及拾取，`viewMode="crowd"` 仍保留区域人数与热力。`overviewScale` 默认 1，仅初始化时配置概览距离；`autoRotate` 默认 true，可响应式暂停。`focus("region-Z4")` 支持区域定位。默认插槽复用投影承载宿主告警。`ScenicBubble.insets` 可指定 top/right/bottom/left 可用区域边距，默认保持原行为。园方自有状态、记录和筛选不进入共享场景。

`showLoadingProgress` 默认 true。宿主统筹加载时可传 false，使用独立 InkProgress；preparation-progress(value) 事件提供真实模型进度，宿主等待 intro-state=ready 后完成全局进度；园方开启 showScroll、关闭 intro，保留卷轴底座且不播放展开动画。

园方专用可选能力：`regionPlaques: ScenicRegionPlaque[]`（regionId/title/value）、`plaqueTheme`、`plaquesVisible`；九处贴牌固定在岛屿侧壁，单面深度遮挡，侧视淡出。替代旧 `regionLabelOffsets` 屏幕投影偏移。游客默认不创建贴牌。

`focusRightInset` 指定焦点构图右侧预留像素，镜头将目标移到剩余空间中心；设为0恢复标准构图。宿主保持同一沙盘组件挂载并调整容器尺寸即可实现总览与专注详情切换。

最新修订：贴牌模型已撤销。`regionLabels: ScenicRegionLabel[]` 启用固定侧壁位置的 `region-label-${id}` 坐标投影，宿主以 DOM 玻璃容器显示数据；没有三维牌面、材质或纹理，游客端默认关闭。园方专注模式保持画布尺寸稳定，详情独立浮层。
