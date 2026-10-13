<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { tab } from "../model/store";
import Icon from "./Icon.vue";
defineProps<{ current: string }>();
const links = [
  ["home", "house", "首页"],
  ["guide", "map", "导览"],
  ["booking", "calendar-days", "预约"],
  ["me", "user-round", "我的"],
];
onShow(() =>
  uni.hideTabBar({
    animation: false,
    fail: () => {
      /* Page may have left the tab during navigation. */
    },
  }),
);
</script>
<template>
  <view class="nav-space" /><view class="bottom-nav"
    ><button
      v-for="item in links"
      :key="item[0]"
      :class="{ active: item[0] === current }"
      @tap="tab(item[0])"
    >
      <Icon :name="item[1]" :active="item[0] === current" :size="22" /><text>{{
        item[2]
      }}</text>
    </button></view
  >
</template>
<style scoped>
.nav-space {
  height: calc(78px + env(safe-area-inset-bottom));
}
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0 auto;
  display: flex;
  background: rgba(248, 252, 250, 0.92);
  padding: 7px max(8px, calc((100vw - 600px) / 2))
    calc(7px + env(safe-area-inset-bottom));
  border-radius: 0;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-top: 1px solid white;
  box-shadow: 0 4px 20px #193b3515;
  z-index: 20;
}
.bottom-nav button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-direction: column;
  background: transparent;
  border-radius: 16px;
  padding: 7px 4px;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  min-height: 52px;
}
.bottom-nav button::after {
  border: 0;
}
.bottom-nav button.active {
  background: #e2eee7;
  color: #175f54;
}
</style>
