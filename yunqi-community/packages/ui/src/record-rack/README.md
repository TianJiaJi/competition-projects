# RecordRackNav · 玻璃唱片架导航

Vue 3 两级导航组件。以透明玻璃包装承载一级标签及片单摘要，半抽出的磨砂唱片承载可旋转片单。无业务、路由、权限或 WebGL 依赖。

```ts
import { RecordRackNav } from '@scene/ui/record-rack';
import type { RecordRackGroup, RackActivation } from '@scene/ui/record-rack';
```

## 最小接入

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RecordRackNav, type RecordRackGroup, type RackActivation } from '@scene/ui/record-rack';

const activeId = ref('articles');
const items: RecordRackGroup[] = [
  { id: 'content', label: '内容管理', items: [
    { id: 'scenic', label: '景区资料' },
    { id: 'articles', label: '资讯与指南' },
    { id: 'pois', label: '景点介绍' },
  ] },
];
function activate(event: RackActivation) {
  // 实际应用先完成路由/离开确认，再由路由状态更新 activeId。
  activeId.value = event.itemId;
}
</script>

<template>
  <RecordRackNav :items="items" :active-id="activeId" @activate="activate" />
</template>
```

组件自身为全视口 fixed 导航浮层，不占文档流。放在应用布局根部；不要放入带 transform、filter 或 contain 的祖先中，以免改变 fixed 定位包含块。宿主自行为收拢的侧栏预留正文边距，展开时无需改变边距。默认 240px 唱片，停靠后整体可见深度约 270px；这比旧后台的 208px 侧栏宽，实际接入时可调 size/retreat 或调整宿主留白。本次仅提供独立演示，不更改后台。

## 数据、事件与状态

一级 `RecordRackGroup`：`id`、`label`、`items`，可选 `icon`（Vue 组件）、`disabled`、`cover`（图片 URL）、`theme`。

二级 `RecordRackItem`：`id`、`label`，可选 `icon`、`disabled`、`href`、`children` 和 `theme`。`children` 为三级 `RecordRackLeaf[]`，字段为 `id`、`label` 及可选 `icon`、`disabled`、`href`，不再接受下级。一级 ID 在分组中唯一；二、三级 ID 在整个导航中唯一且稳定。组件不排序、不执行权限查询，宿主提前筛选不可见项。

- `items` 为必填数组；`activeId` 为宿主控制的当前二级或三级页面 ID，可为空。
- `activate({ groupId, itemId, parentItemId?, source })` 请求导航；`source` 为 `wheel | pointer | keyboard`。点击包装或键盘打开包装时，立即请求进入第一个可用二级项；再次打开也回到首项，首项已经是当前页时不重复导航。组件不会自行修改 activeId，也不会自动打开 href；链接作为宿主数据保留，可按需用于路由适配或插槽呈现。
- `preview-change({ groupId, itemId, parentItemId? })` 仅通知预选；无可用项时 itemId 为 null，无展开分组时 groupId 为空字符串。首次挂载也通知预选。
- 宿主保持原 activeId 即可拒绝导航。异步导航结束后由实际路由更新 activeId；不要为了响应事件提前更新。切换页面、替换或深度修改菜单数据会取消旧滚轮动作并按当前值恢复。
- `title` 默认“功能导航”，会在最前方增加一张独立的非交互标题唱片；没有按钮、悬停或展开行为。设为空字符串可隐藏，`title` 插槽可替换标题内容。标题唱片计入单屏上限。
- 当前页使用下划线及强调文字，预选使用底色和固定三角；二者互不混淆。未选中新项便移出菜单，恢复当前页唱片。
- 禁用分组不可打开；禁用二级项在包装摘要上弱化，并从可操作盘面移除。单项仍需抽盘，空片单不导航。浅抽出比例下会收窄片单文字并减少可见项，以免包装遮挡文字。长名称单行省略，完整文字保留在 title 和可访问名称中。

### 后台分支适配样例

后台 `sidebarGroups` 已包含组名、路由名、路径和菜单文字。适配留在宿主，以下代码供接入时使用，不引入公共组件：

```ts
import { computed } from 'vue';
import type { RecordRackGroup, RackActivation } from '@scene/ui/record-rack';
// sidebarGroups、route、linkTo 来自后台原有 router 模块。
const recordItems = computed<RecordRackGroup[]>(() => sidebarGroups.map(group => ({
  id: group.items[0].name,
  label: group.title,
  items: group.items.map(item => ({
    id: item.name, label: item.label, href: linkTo(item.path),
  })),
})));
const activeId = computed(() => {
  if (['article-new', 'article-edit'].includes(route.value.name)) return 'articles';
  if (route.value.name === 'poi-edit') return 'pois';
  return route.value.name;
});
function activate({ itemId }: RackActivation) {
  const item = recordItems.value.flatMap(group => group.items).find(item => item.id === itemId);
  if (item?.href) window.location.hash = item.href;
}
```

后台的编辑页仍归属原列表项；原登录、权限、离开确认和路由处理继续由后台负责。如业务提供导航守卫，应在上面的 hash 更新前执行。

## 布局与运动参数

`placement`：`left`（默认）、`right`、`top`、`bottom`。`orientation`：`auto`（默认）、`vertical`、`horizontal`。自动模式左右纵排、上下横排；显式方向优先。所有停靠方向统一使用相同的横向文字排版：标题、一级标签、片单摘要和底部说明均不随排列方向改成竖排；盘面上的二级菜单沿各自所在直径方向排布，并随唱片旋转角度转动；顶部、底部选中位置的文字沿竖直直径排列，顶部停靠时字的顶部朝左。

`layout` 接收下表字段，均为可选；尺寸与距离单位为 px。

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| fill | false | 按可见唱片数直接铺满排列轴的可用空间，保留最小间距与压叠；空间不足时滚动 |
| size | 240 | 包装与唱片直径，180–420；小视口自动缩小以容纳展开组合 |
| spacing | 62 | 基础错叠步长，48 至实际 size；接近上限时可自动增大 |
| maxVisible | 8 | 单屏唱片上限（含标题），3–24；超出部分滚动浏览 |
| tilt | -1.5 | 未展开包装倾角，-12° 至 12° |
| probe | 16 | 悬停探出距离，0–100 |
| extract | 0.5 | 唱片抽出比例，0.35–0.75 |
| retreat | 124 | 当前唱片退回距离，最多实际 size 的 60% |
| edge | 18 | 距视口边缘的间距，4–80 |
| zIndex | 40 | 整个导航层级 |

悬停时按加入三级菜单前的逻辑探出、回正，相邻包装让位露出片单；点击抽盘和二级选单沿用悬停阶段的位置，不重新居中或调整间距。当前可见窗口的末张采用贴边收尾：包装不向内探出，只抽出唱片；尾部预留空间分配给末张自身，使架子末端位置保持稳定，不添加占位唱片。展开包装与后续包装保留约 28px 压叠，自然排列方向下后续包装仍压在前一张边缘上。抽出始终朝页面内部，操作中的组合受视口约束。所有收起的包装向停靠边缘退入屏幕，内容区根据实际裁切量增加安全内边距，一级标签和标题留在可见区域；当前页面由包装标签及盘面选中状态表达。数量少于上限的 75% 时沿用基础间距；达到默认上限 8 张的 6–8 张时，逐渐放大间距以利用更多屏幕空间，仍保留重叠。超过上限只展示一个连续窗口，其他唱片通过包装区域滚轮或架子的前后按钮浏览；小视口空间不足时保留基础间距并允许滚动。键盘移动分组时自动使其进入视口。

`motion`：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| duration | 260 | 包装让位、探出、回正和抽盘的原始过渡时长，0–1500ms |
| damping | 18 | 阻尼趋近速率，6–40；小值滑行更久 |
| wheelStep | 100 | 每项所需滚轮像素，30–300；行和页单位自动换算 |
| settleDelay | 180 | 最后一次滚轮输入后的最短等待，180–1000ms |
| parkDelay | 200 | 离开后的停靠延迟，0–1500ms |
| snapEpsilon | 0.002 | 吸附完成阈值，以菜单项间距为单位，0.0001–0.02 |

滚轮结束且吸附完成才提交一次，不循环，首尾阻力不产生越界导航。右侧、顶部和底部停靠的盘面滚轮方向相对左侧反转，键盘方向键规则不变。仅展开盘面接管片单滚轮；Ctrl/Meta 滚轮直接放行。方向键预选不会自动导航，Enter 确认。架子分组支持排列方向上的箭头、Home/End；Enter/空格打开并聚焦盘面。盘面四个箭头及 Home/End 均可移动，Esc 恢复当前页唱片并把焦点返回包装。

只有键盘操作留下的焦点阻止退回，鼠标点击造成的按钮焦点不会锁住展开态。减少动态效果时无旋转、抽取、弹性过渡，但保留停稳判定。组件卸载会取消动画帧、定时器和全局监听。

## 主题与插槽

`theme` 和每个分组的 `theme` 都是 CSS 自定义属性对象，单张覆盖优先。也可给组件根元素传 `style`/`class` 覆盖变量。

| CSS 变量 | 默认 |
| --- | --- |
| --rack-tint | `239 248 247`，空格分隔 RGB |
| --rack-opacity / --rack-blur | `.36` / `18px` |
| --rack-disc-opacity / --rack-disc-blur | `.25` / 跟随 --rack-blur，单独控制盘面材质 |
| --rack-text / --rack-muted | `#203d3b` / `#58736e` |
| --rack-accent / --rack-active | `#20685b` / `#236556` |
| --rack-summary-size | `11px`，包装片单摘要 |
| --rack-support-size | 辅助字号：默认序号和滚动提示 `10px`，当前页提示及空态 `11px` |
| --rack-highlight | `rgb(255 255 255 / .85)` |
| --rack-border | `rgb(255 255 255 / .78)` |
| --rack-shadow | `0 15px 40px rgb(30 60 55 / .14)` |
| --rack-radius / --rack-font | `12px` / `inherit` |
| --rack-title-size | `24px`，独立标题唱片的大标题 |
| --rack-label-size / --rack-track-size | `14px` / `12px` |

```vue
<RecordRackNav :items="items" :active-id="activeId"
  placement="right" :layout="{ size: 220, retreat: 100 }"
  :theme="{ '--rack-tint': '30 48 55', '--rack-text': '#eef7f4', '--rack-muted': '#c0d2cc', '--rack-highlight': '#254545', '--rack-active': '#c3f6df' }"
  @activate="activate">
  <template #label="{ group, active }">
    <strong>{{ group.label }}</strong><span v-if="active">●</span>
  </template>
</RecordRackNav>
```

| 插槽 | 参数 |
| --- | --- |
| title | 无，独立非交互标题内容 |
| cover | group |
| label | group, active |
| summary | group |
| item | item, group, preview, active, level（2 或 3）, parent（三级所属二级项） |
| indicator | group, item（可能为空）, level, parent（三级时） |

插槽替换内容，不替换按钮和交互区域。不要向 label、summary、cover、item 内嵌套链接、按钮或其他交互控件；避免覆盖定位/transform，以免破坏盘面命中和径向文字排版。指示器由组件按停靠方向旋转。没有背景模糊支持时回退到较实的半透明底色；提供强制颜色模式和 focus-visible 样式。

## 演示与验证

运行 `pnpm dev:ui`，访问 `/record-rack.html`。演示使用博客六组菜单与文章预览，主页面固定一屏，不滚动。常用面板保留停靠、排列、主题、尺寸和阻尼；“更多设置与演示”打开独立浮层，调整标题、材质及进阶运动参数，默认展示博客三级菜单，也可切回二级菜单；查看长片单、单项、全部子项禁用和空菜单，模拟拒绝导航、外部切页、动态删除及卸载。浮层内部可滚动，支持 Esc 关闭并恢复焦点。

```sh
pnpm typecheck
pnpm build:ui
pnpm exec vitest run tests/unit/record-rack-motion.test.ts
pnpm exec playwright test --config playwright.ui.config.ts tests/ui/record-rack.spec.ts tests/ui/record-rack-nested.spec.ts
```

首版验收面向桌面鼠标、触控板和键盘。未实现触屏拖动，也不提供独立 npm 构建产物；当前工作区直接消费 Vue/TypeScript 源码导出。

片单摘要采用统一可见面积规则：包装露出至少 85% 时常驻显示，包含视口裁切和前方包装、盘面的遮挡；不足时仅在展开、悬停或键盘浏览时显示。不再对末张或倒数第二张单独处理。面积在运动结束后重新计算，隐藏摘要不改变包装布局。

## 三级接入

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RecordRackNav, type RecordRackGroup, type RackActivation } from '@scene/ui/record-rack';
const activeId = ref('vue-notes');
const items: RecordRackGroup[] = [{
  id: 'blog', label: '技术博客', items: [
    { id: 'frontend', label: '前端开发', children: [
      { id: 'vue-notes', label: 'Vue 实践', href: '/blog/vue' },
      { id: 'css-notes', label: 'CSS 小实验', href: '/blog/css' },
    ] },
    { id: 'tools', label: '工具分享', href: '/blog/tools' },
  ],
}];
function activate(event: RackActivation) {
  // 实际宿主在路由成功后由路由更新 activeId；此处为最小本地演示。
  activeId.value = event.itemId;
}
</script>
<template>
  <RecordRackNav :items="items" :active-id="activeId"
    :nested-theme="{ '--rack-opacity': .3 }" @activate="activate" />
</template>
```

有非空 `children` 的二级项作为目录。点击或二级滚轮停稳确认后切换其三级唱片，并请求首个未禁用三级页面；全部子项禁用时显示空盘，不发起导航。空 `children` 数组按普通二级项处理。旧二级数据和事件字段仍然有效，三级导航额外提供 `parentItemId`，`itemId` 始终是最终页面 ID。

三级共用一张包装，叠在二级唱片下方，保持包装尺寸并相对二级盘上下微错开 12px；仅三级盘抽出的部分增加整体宽度或深度，不额外占用排列方向的空间。切换二级目录时保持盘面展开，直接更新内容，不重复收回和抽出；选择二级叶子则沿抽出路径平滑收回三级盘。收起的一级包装以额外露出的一层包装边缘提示存在下级，叠层同时向下微错开 8px。子包装不重复显示标签或片单。`nestedTheme` 覆盖继承主题，目录 `theme` 可单独覆盖。

二级滚动途中保留旧三级盘，停稳后才切换；两盘独立处理滚轮，操作其中一盘会取消另一盘尚未提交的滚动。三级盘方向键预选、Enter 导航，Esc 返回所属二级项，二级区域再按 Esc 恢复宿主当前路径。Tab 可进入三级盘；切换父项、删除及卸载会取消待提交动作。宿主外部切到三级页面时，自动恢复所属一级、二级和三级选中位置。只有最终页面带 `aria-current="page"`，祖先使用颜色与当前分组标记。

后台仍按最终 ID 映射路由，可直接扩展原有适配表：

```ts
const routeByItem: Record<string, string> = {
  'vue-notes': '/blog/vue', 'css-notes': '/blog/css', tools: '/blog/tools',
};
async function activate({ itemId }: RackActivation) {
  const path = routeByItem[itemId];
  if (path) await router.push(path);
  // 使用路由监听同步 activeId，守卫拒绝时保留原值。
}
```

盘面直径为包装尺寸的 94%，在包装中心基础上抽出，收回后四周保留 3% 留边；二、三级盘使用相同比例，文字与指示器按实际盘面定位。

打开含三级目录的包装时，共用三级包装与盘一起朝正文方向让开最多 22% 包装尺寸（受视口剩余空间约束），一级包装与二级盘保持不动。二级盘使用更清晰的玻璃底色，`--rack-reading-opacity`（默认 `.68`）可覆盖。让位后在整个跨层操作期间保持位置，避免追着指针移动；离开停靠后恢复紧凑位置。Shift+Tab 从三级返回二级；跨层取消尚未提交的滚动并吸附预选，停回原二级目录不会重置三级页面。

动效恢复自本任务在首次提出三级菜单后、实施前读取的原始源码（2026-09-13）：包装位移与抽盘使用 260ms、`cubic-bezier(.2,.8,.2,1)`；悬停探出与回正、相邻让位、末张压叠及离开退回沿用原逻辑，不加时长倍率或新弹簧曲线。三级包装跟随父级几何位置，并使用同一过渡。

非预览包装默认退回 124px；离开预览且组件无键盘焦点后，三级盘保持半抽出，整组子层靠回上一级叠放，优先让出正文。重新进入或聚焦后使用原版 260ms 动画恢复操作位置。

已展开但停靠时，圆盘保持抽出，子层以 18% 包装尺寸的偏移扇叠，保留双层圆弧盘缘；未展开时只显示包装及下级包装提示，区分两种状态。

三级层仅在预览焦点属于它的一级组或盘面时舒展；预览其它包装时，即使整个唱片架仍处于交互状态，非焦点三级层也靠回父层扇叠，并取消失效的待提交滚动。盘本身保持抽出，不收回包装。
