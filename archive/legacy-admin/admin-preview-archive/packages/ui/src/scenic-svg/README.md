# 公共 SVG 景区地图

面向后续手机端导览的公共底图，也是游客卷轴上唯一的地图来源。本轮没有手机页面、订单或手机端导航流程。

```vue
<script setup lang="ts">
import { ScenicSvgMap } from '@scenic/ui/scenic-svg';
</script>
<template>
  <div style="width:100%;height:700px">
    <ScenicSvgMap :show-labels="true" :show-facilities="true" />
  </div>
</template>
```

- `showLabels`、`showFacilities` 默认 `true`，只控制底图名称与服务点符号。
- 北向朝上，`viewBox="-37 -36 76 76"`。SVG 的 `x/y` 对应三维景区的 `x/z`；`scenicSvgPoint(id)` 返回建筑/停车实体对应的地图锚点，无匹配时返回 `undefined`。
- 山体等高分层、湖岸、瀑布、双向步道、桥梁、广场、索道与停车场直接复用共享几何；广场内不画重复连接线。
- 地图采用石青、石绿、浅青湖水、淡赭步道和细墨线。景点名称、设施符号和主要区域保持清晰；不把底图的装饰颜色解释为实时忙闲状态。
- 点位保留 `data-point-id`、路径保留 `data-edge-id`；后续交互可在同一坐标系添加状态、路线或选中层。
- `createScenicSvg(options)` 返回完整 SVG 字符串，可独立导出，也可用于非 Vue 宿主。`idPrefix` 区分同页面的多个 SVG；Vue 组件自动生成。`projection` 只用于把底图投射到三维卷轴，普通二维导览省略。
- 底图不依赖 WebGL、游客页样式或网络。卷轴将这份 SVG 一次性绘制为纹理，在纸张未展开时图案就已经存在；仅在模型初始化时生成，不逐帧重绘。

`createScenicSvg` 的 `showVisitorFixtures` 默认 true；false 时隐藏新增终端、安全符号及其接入边。卷轴使用 false 保留既有构图。
