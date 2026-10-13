# 青岚山境 · 简约景观插画

全景、九处景点和圆形 Logo 共 11 张原生 SVG。采用全局视觉规范的浅青、石青、石绿、淡青及少量赭金，大块设色、透明叠层与留白表现轻水墨。插画用于介绍与品牌展示；导航继续使用 `@scene/ui/scenic-svg` 和共享路网。

## Web 公共组件

```vue
<script setup lang="ts">
import { ScenicIllustration, ScenicLogo } from '@scene/ui/scenic-art';
</script>
<template>
  <ScenicLogo :size="40" decorative />
  <ScenicIllustration point-id="falls" :height="240" fit="cover" />
</template>
```

- `ScenicIllustration`：`pointId` 默认 `landscape`，未知或设施 ID 回退全景；`width` 默认 `100%`，不指定 `height` 时比例为 3:2；尺寸支持数字像素和 CSS 字符串。`fit` 支持 `contain`（默认）与 `cover`。
- `label` 自定义无障碍名称，未提供时使用素材描述；同一页面已有等价内容时设置 `decorative`。装饰图片不重复播报，SVG 内部不可聚焦。
- `ScenicLogo`：`size` 默认 40px，`label` 默认「青岚山境」，支持 `decorative`。圆外透明，16px 起保持轮廓辨识。
- 插画用 Vue `useId` 为每个实例生成独立渐变 ID。仅注入包内固定 SVG，调用方的名称不拼入 SVG 标记。
- 没有动画、外部字体、位图嵌入或重型滤镜。全景与景点 `viewBox="0 0 1200 800"`，Logo 为 `0 0 256 256`；16:9 居中裁切保留主体，更极端的比例需在页面中检查。

## 静态资源与手机端

`assets/*.svg` 是唯一可编辑美术源；不要手工修改各端导出副本。

```sh
pnpm assets:scenic-art
```

导出到游客屏、园方屏、后台的 `public/assets/scenic-{id}.svg`，同步三端 `favicon.svg`；手机端输出到 `src/static/scenic-art/{id}.png`，插画为 1200×800，Logo 为 256×256。依赖现有手机工作区的 `@resvg/resvg-js`。手机原有 `assets` 命令也会执行本导出。

```ts
// 不引入 Vue 或 SVG 内容，可用于 uni-app。
import { scenicArtForPoint, scenicArtUrl } from '@scene/ui/scenic-art/catalogue';
scenicArtUrl('lake'); // /assets/scenic-lake.svg
scenicArtUrl('lake', 'mobile'); // /static/scenic-art/lake.png
scenicArtForPoint('t1'); // 全景元信息
```

素材 ID：`landscape`、`entry`、`creek`、`bamboo`、`gorge`、`summit`、`falls`、`lake`、`forest`、`market`，另有独立 `logo.svg`。导出 `ScenicArtId` 与 `ScenicArtPointId` 类型。后台原有四个素材的 ID、路径和排序保留，新增六幅景观；已保存的封面引用不重置。

## 预览与验证

`pnpm dev:ui` 后打开 `/scenic-art.html`。可查看全景、九景、Logo 的 16／24／32／64px 表现、16:9 裁切及 SVG 下载。

```sh
pnpm exec vitest run tests/unit/scenic-art.test.ts
pnpm exec playwright test --config playwright.ui.config.ts tests/ui/scenic-art.spec.ts
```

单测覆盖点位映射、设施兜底、导出一致性、PNG 尺寸、旧路径和渐变隔离。浏览器测试覆盖无障碍名称、重复实例、下载、裁切、手机宽度及运行错误。截图位于 `.local/qa/scenic-art/`。

本轮已通过：公共及手机类型检查，UI、游客屏、园方屏、后台、手机 H5 与微信小程序构建，后台 94 项单测。微信小程序已编译及验证导出 PNG，未进行微信真机测试。

跨端页面检查已通过：手机首页与九景详情、设施全景兜底、原导览底图；后台十幅封面选择及保存后刷新、侧栏完整品牌名；游客屏展开景点介绍后的对应插画；园方屏标题 Logo。预览已在 390px 与桌面宽度检查，SVG 下载和多实例定义隔离通过。
