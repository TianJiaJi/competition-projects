# 等高线背景

静态、低对比度的全幅等高线背景，适用于 Vue 3.5+ 的手机、平板、桌面与大屏网页。无额外运行时依赖。

```vue
<script setup lang="ts">
import { ContourBackground } from '@scenic/ui/contour';
</script>

<template>
  <ContourBackground class="section" variant="corners">
    <div class="content"><h1>页面标题</h1><button>开始探索</button></div>
  </ContourBackground>
</template>

<style scoped>
.section { min-height: 480px; border-radius: 16px; color: #30352e; }
.content { padding: 48px; }
</style>
```

## 参数

| 参数 | 类型 | 默认值 / 行为 |
| --- | --- | --- |
| `theme` | `'light' \| 'dark'` | `'light'`；宿主显式选择，不自动读取系统主题 |
| `variant` | `'corners' \| 'left' \| 'right'` | `'corners'`；连续地形 / 坡脊切片 / 凹谷切片，保留已有枚举值以兼容调用 |
| `backgroundColor` | CSS 颜色字符串 | 浅色 `#f5f4ef`；深色 `#202321` |
| `lineColor` | CSS 颜色字符串 | 浅色 `#000000`；深色 `#ffffff` |
| `lineOpacity` | `number` | 浅色 `0.05`；深色 `0.06`。限制在 0–1，非有限值回退到主题默认值 |

同时导出 `ContourBackgroundProps`、`ContourTheme`、`ContourVariant` 类型。默认插槽承载内容，没有事件和命令式接口。

```vue
<ContourBackground
  theme="light"
  variant="right"
  background-color="#eaf3ef"
  line-color="#193b35"
  :line-opacity="0.06"
  style="min-height: 360px"
>
  <div style="padding: 32px">自定义浅青色背景</div>
</ContourBackground>
```

主题只设置背景和线条，内容前景色、控件样式由宿主管理。使用深色背景时请为内容指定合适的浅色。颜色覆盖相互独立；只改底色时，也应检查当前线色是否适合它。`lineOpacity` 只影响装饰层。

## 布局和兼容性

- 组件为普通块级容器；高度由内容、`height` 或 `min-height` 决定。无内容且未给高度时不占高度。填充已有容器可显式设置 `width: 100%; height: 100%`，父容器须有明确高度。
- 背景填满整个容器；不再局限于边角或刻意留空中央。内容间距建议放在插槽内部，文字及控件可直接叠加。
- 使用同一个连续高度场的 14 个等高层，呈现坡脊、凹谷及鞍部，线距随坡度自然收紧与展开。多处地形连续分布，避免单一同心山峰占据整幅背景。
- 静态纹理周期为 1600 × 1120 CSS px，边缘连续拼接，宽屏及长页面自动铺满。长背景会出现周期性重复；无运行时地形计算、动画或重绘循环。
- 线宽固定 1.5 CSS px。小屏截取局部地形，保持线距和线宽，不将整幅图缩小挤入手机；桌面与大屏扩大可见地形范围。
- 只有装饰层裁切并继承圆角；内容的溢出、弹出菜单和焦点轮廓不会被背景裁切。组件建立局部堆叠上下文。
- SVG 图案使用 Vue `useId()` 为每个实例生成独立 ID，多个或嵌套实例互不引用。装饰隐藏于辅助技术、不拦截点击、不可选择。强制颜色模式隐藏装饰。
- 目标为支持 SVG pattern 的现代网页浏览器。本次用 Chromium 验证，未验证原生小程序及旧版 WebView；组件无动画、计时器、Canvas 或 WebGL。

## 预览与检查

运行 `pnpm dev:ui`，打开 [等高线预览](http://127.0.0.1:5174/contour.html)。原 `/` 仍为液态玻璃示例；`pnpm build:ui` 会构建两个入口。

预览提供三种地形取景、浅深主题、自定义颜色、透明度、只看背景和长页面开关，默认展示纯背景，附 320px 窄容器及独立主题对照实例。透明度滑块限制在 0–15%，便于检查轻量装饰；组件本身支持 0–1。

检查命令：`pnpm typecheck`、`pnpm build:ui`。在 390 / 768 / 1440 / 1920px 宽度下检查留白、形状、溢出和交互。纹理只作为装饰，正文与按钮不能依赖它传达信息。

## 静态素材维护

`terrain.ts` 保存预计算的等高线。需要调整地形时，使用安装了 `numpy`、`contourpy` 的 Python 执行 `python3 packages/ui/src/contour/scripts/generate-terrain.py`。这些依赖只用于素材维护，正常构建和浏览器运行均不需要 Python。生成器使用周期高度场，边界首尾相接；曲线简化误差限制为 0.3px，保持不同等高层的疏密关系。
