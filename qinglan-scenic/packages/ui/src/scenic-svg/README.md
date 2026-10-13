# 公共 SVG 景区地图

公共底图默认采用青绿山水精绘版，游客卷轴、Vue 地图及手机端导出的底图统一复用。

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

```ts
const svg = createScenicSvg({idPrefix:'my-guide'});
// Export artwork without point annotations, e.g. for a mobile overlay host.
const base = createScenicSvg({showMarkers:false,showLabels:false,showFacilities:false});
```

- `style` / Vue 的 `mapStyle` 为 `'qinglv' | 'classic'`，默认 `qinglv`；`classic` 仅用于独立预览页的原版对照。
- 北向朝上，`viewBox="-37 -36 76 76"`。景点保持共享锚点，`scenicSvgPoint(id)` 返回对应坐标；未知 ID 返回 `undefined`。停车场、停车标记及三条停车接入边不在新版画面中绘制；共享停车业务数据仍然保留。
- **风格化优先**：游路采用多段连续转折的曲线，配合宽窄变化、石板和局部山阶。桥梁采用直跨；林间、竹林、山顶及集市的邻近支路复用同一段主通道，只在目的地入口分支，重合部分仅绘制一次。`paintedRoads` 保存新版的路线几何和采样，`data-edge-id` 关联共享路段；叠加路线必须使用这些绘画采样，不能直接使用三维路段坐标。距离及时间仍来自真实共享路网数据。
- 山水、松竹、亭阁、入口园林空地、长落差瀑布、索道吊厢及支架均以原生 SVG 绘制。外缘逐渐融入纸面，无外部位图、网络资源或 WebGL 依赖。
- `showLabels`、`showFacilities`、`showVisitorFixtures`、`showMarkers` 默认 `true`。`showMarkers:false` 隐藏点位符号与其题签，保留景物插画；`showLabels:false` 隐藏画题与景点名称。`showVisitorFixtures:false` 隐藏终端、安全符号及接入边。索道插画属于地景，隐藏设施标记仍保留吊厢、支架和站房。
- `idPrefix` 区分同页面多个 SVG，Vue 组件自动生成。`projection` 将同一张图投射到三维卷轴；卷轴仅在初始化时栅格化，不逐帧重绘。
- 画题及标注使用本机楷体/宋体回退，无网络字体依赖；其他设备可能采用其 serif 字体。

## 预览与交付

- `pnpm dev:ui` 后访问 `/scenic-svg.html`：全图自适应、100%—400% 缩放、原版对照、名称/设施开关及 SVG 下载。
- `node scripts/export-qinglv-map.mjs`：开发服务器启动后，导出 SVG、整体图、原版对照及主峰/瀑布/竹林/入口和 200%/400% 局部图到 `.local/qa/qinglv/`。
- `pnpm --filter @scenic/mobile assets`：重新生成手机底图和八条游览线路图。移动端行进位置与蓝色路线覆盖层使用同一份 `paintedRoads` 采样；地图不显示停车标记，停车预约和订单业务保留。
