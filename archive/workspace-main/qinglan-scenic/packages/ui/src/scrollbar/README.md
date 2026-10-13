# 液态玻璃公共滚动条

`@scenic/ui/scrollbar` 为 Vue 3 Web 提供 `ScrollArea`，并可直接增强已有滚动元素。内容仍使用原生 overflow，不接管内容区域的滚轮、触摸惯性、选区或滚动锚点。与三维卷轴 `@scenic/ui/scroll` 无关。

## 新容器

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ScrollArea, type ScrollState } from '@scenic/ui/scrollbar';
const area = ref<InstanceType<typeof ScrollArea>>();
function handleScroll(state: ScrollState) { console.log(state.atBottom); }
</script>
<template>
  <ScrollArea ref="area" style="height: 360px; padding-right: 28px"
    direction="vertical" theme="auto" visibility="interaction"
    label="景点介绍" @scroll="handleScroll">
    <slot />
  </ScrollArea>
  <button @click="area?.scrollTo({ top: 0 })">回到顶部</button>
</template>
```

容器本身就是滚动元素，不增加内容包装层。尺寸用 CSS 设置；flex/grid 布局必须给可滚动区域约束高度。横向或双向表格仍可使用原来的 sticky 表头。

| 参数 | 值 | 默认 |
| --- | --- | --- |
| direction | `vertical` / `horizontal` / `both` | `vertical` |
| theme | `auto` / `light` / `dark` | `auto` |
| visibility | `interaction` / `always` / `scroll` | `interaction` |
| label | 滚动区域可访问名称 | `可滚动内容` |

组件暴露 `element`、`scrollTo(ScrollToOptions)`、`scrollBy(ScrollToOptions)`、`update()`。原生 scroll 发生时发出状态：`left`、`top`、`maxLeft`、`maxTop`、`atLeft`、`atRight`、`atTop`、`atBottom`；边界允许 1px 舍入误差。业务自己的聊天跟随、历史加载、分页与恢复逻辑仍监听原元素或此事件。

## 已有元素与整页

```ts
import { attachScrollbar, installScrollbars } from '@scenic/ui/scrollbar';
const controller = attachScrollbar(existingElement, {
  direction: 'both', label: '订单列表', onScroll: state => console.log(state.top),
});
// 卸载时 controller.destroy()。

// 应用级渐进迁移：挂载 Vue 后安装一次，返回函数用于热更新或应用卸载。
const dispose = installScrollbars();
```

`attachScrollbar` 的方向默认 `both`，遵守宿主原有 overflow 限制。`installScrollbars` 发现页面主滚动及原生 overflow:auto/scroll 元素，并增量检查动态菜单、路由与样式变化。它不替换 DOM；绑定的类、自动 ID、自动 tabindex 和监听器在销毁时清理。同一元素重复绑定返回现有控制器，生命周期应由一个调用者管理；修改选项需先销毁再绑定。

`data-scrollbar="off"` 排除整个子树。组件实例不依赖全局安装器。页面使用 `document.scrollingElement`，保留锚点、文档滚动与浏览器恢复。页面锁定滚动时不显示对应轨道。自定义滑块通常挂载在 body 的固定浮层中；原生 dialog/popover 内的宿主使用其顶层容器。浮层跟随宿主位置，按祖先裁切，并避免显示在无关遮挡元素上方。

内容、图片与宿主尺寸改变后自动同步；手动修改复杂布局后也可调用 `update()`。可见期间用 RAF 对齐移动面板，隐藏或无溢出时停止连续帧。所有 observer、pointer capture 相关监听、计时器和浮层在销毁时释放。

## 视觉和操作

默认滑块 6px、桌面命中区 14px、粗指针命中区 24px、最短滑块 32px。透明命中区中与滑块同长度的一段也支持拖动。双轴交汇处预留互不重叠的空间。

`interaction` 在鼠标悬停、键盘聚焦、滚动或拖动时显示；触摸进入不会触发悬停。停止交互 800ms 后淡出 160ms，持续悬停/聚焦/拖动保持显示。`scroll` 不因初次悬停显示，但键盘聚焦可发现滑块。`always` 仍仅显示溢出方向。减少动态效果时取消过渡。

轨道点击翻动一屏，拖动即时定位；滚轮落在浮层轨道上时路由到原容器，边界继续遵守祖先滚动与 overscroll-behavior。Ctrl+滚轮保持浏览器缩放。滑块支持方向键、PageUp/Down、Home/End 和 Space；内容区域继续使用浏览器原生键盘操作。

可在宿主上设置下列 CSS 变量；数值尺寸使用 px：

| 变量 | 默认/用途 |
| --- | --- |
| `--scrollbar-size` | `6px`，可见滑块粗细 |
| `--scrollbar-hit-size` | 桌面 `14px` / 粗指针 `24px` |
| `--scrollbar-inset` | `4px`，距离外边缘 |
| `--scrollbar-thumb-color` | 覆盖主题滑块底色 |
| `--scrollbar-focus-color` | 键盘焦点描边 |
| `--scrollbar-z-index` | `2000`，浮层层级 |
| `--scrollbar-native-color` | 原生输入控件滚动条颜色 |

继承已有 `--glass-tint-rgb` 和 `--glass-border`；浅深主题通过宿主 `data-theme` 或系统偏好解析。不支持背景模糊时保留半透明底色，高对比度模式使用系统颜色。

滚动条不占布局空间。宿主应在有按钮的一侧留至少命中区宽度，横向列表底部同理；本次迁移已补齐典型面板、列表、表格末列与编辑区留白。不要把重要的边缘操作直接放在透明命中区下方。

## uni-app

`@scenic/ui/scrollbar/uni` 导出无 DOM、无 Vue 运行时依赖的 `createUniScrollAdapter`、状态类型与计算函数。手机工程通过相对源码入口使用它，无需升级 Vue。

薄封装 `apps/mobile/src/components/UniScrollArea.vue` 位于 uni-app 的 src 内：微信编译器不能直接编译工作区外的 SFC 输出路径。它提供原生 `scroll-view`，参数与 Web 的方向、label、theme、visibility 一致；theme 与 visibility 是保留的语义参数，小程序实际外观和显隐由平台决定。方法提供 `scrollTo({ top, left })`、`scrollBy({ top, left })`、`update()`，不提供 DOM 引用和 Web 的 behavior 参数。

封装首次挂载测量视口与内容，原生滚动事件更新状态；小程序异步内容或布局变化后由宿主调用 `update()`。H5 的内部原生滚动元素由全局安装器增强为玻璃滑块，小程序产物不包含 Web 控制器与 CSS。

手机既有页面继续原生页面滚动，保留 `onPageScroll`、`uni.pageScrollTo`、输入法和安全区行为。独立演示页 `/#/pages/demo/index` 新增 200px 高的原生滚动组件验收区。

## 迁移清单

| 应用/宿主 | 接入与例外 |
| --- | --- |
| 后台整页 | 入口安装器增强实际文档滚动；流程页原有锁定不变 |
| 后台 `.table-scroll` | 原元素绑定，保留 ref、表头与恢复逻辑；末列和底边留白 |
| 后台 `.drawer__body`、`.modal__body`、概览通知面板 | 自动发现，保留弹窗锁定与焦点逻辑，补右侧留白 |
| 后台 `.flow-filter-popup__body`、状态提示 | 动态发现，保留已有 24px 筛选内边距 |
| 后台 `.flow-editor__scroll` | 原宿主增强，增加右侧留白，输入框仍原生 |
| 后台 `.room-list`、`.message-list` | 原宿主增强并留白，聊天锚点和自动跟随不变 |
| 园方 `.alert-list`、`.event-feed` | 自动增强并留白，删除原生分散配色，继承主题 |
| 游客 `.panel-content` | 自动增强并补右侧留白，保留触摸、弹层和定位 |
| 游客 `.filter-row`、`.bottom-dock` | 横向溢出时自动增强，补底部命中区留白 |
| 共享 `.scenic-bubble-content` | 直接使用 ScrollArea，独立使用也具备滚动条 |
| 闸机端整页和 `.dialog` | 自动增强；dialog 滚动条位于对应顶层容器 |
| 闸机日期/选择器 `::picker(select)` | 属于浏览器原生选择控件，保留原生 picker；不覆盖伪元素 |
| 手机 H5 页面及 `scroll-view` 内部宿主 | H5 条件入口自动增强，保留页面及 uni 事件 |
| 微信小程序页面、演示 scroll-view | 原生页面/组件滚动，使用平台适配，不承诺玻璃与拖动一致 |
| textarea、input、select、原生 picker | 保留原生选区、输入法与控件行为，CSS 能力范围内统一 |
| 地图、三维沙盘、唱片架 | 不改变缩放、拖动、滚轮吸附；仅处理其中普通 overflow 区域 |

## 演示与验证

`pnpm dev:ui` 后打开 `/scrollbar.html`。包括主题/显隐/粗细调节、双向 sticky 表格、动态内容、嵌套横向列表、原生输入框和已有 DOM 适配。

```sh
pnpm exec vitest run tests/unit/scrollbar.test.ts
pnpm exec playwright test --config playwright.scrollbar.config.ts
pnpm typecheck
pnpm typecheck:mobile
pnpm build:ui
pnpm build:mobile
```

本次验证：4 项单元测试通过；组件浏览器用例 39 项通过、3 项按引擎能力跳过；后台 14 项、游客 8 项、闸机 8 项、园方 2 项、手机 5 项业务回归通过，手机另 1 项真实 AI 调用按原有开关跳过。

浏览器用例覆盖 Chrome、Chromium、Firefox、WebKit、Android Chrome 与 iPhone WebKit 的模拟视口；真实触摸输入注入仅在 Chromium 系列自动化，WebKit/Firefox 跳过该注入用例，仍验证鼠标拖动与键盘。截图保存在 `.local/scrollbar-qa/component`。WebKit 自动化不能替代发行版 Safari 和 iOS 真机。

已执行后台流程/主题、游客触摸导航、园方主题/无 WebGL、闸机流程、手机布局与聊天恢复回归。所有应用及 H5/微信小程序完成构建。

待设备验收：发行版 Edge/Safari、iOS/Android 真机触摸惯性和输入法、小程序开发者工具及微信真机。已尝试通过微信开发者工具 CLI 打开构建工程，工具返回“IDE service port disabled”，未开启其安全设置中的服务端口，因此 IDE 运行验收未完成。验收时检查拖动热区、软键盘遮挡、安全区、页面返回恢复、问答页跟随和无模糊回退。未执行真实 AI 调用测试。不要把上述模拟/构建结果当作真机通过记录。
