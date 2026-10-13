<script setup lang="ts">
import {formatNumber} from "../../../../../packages/client/src/format-number";
import ScenicStatus from "../../components/ScenicStatus.vue";
import {
  useScenicState,
  refreshScenicState,
  scenicStatus,
} from "../../services/scenic-state";
useScenicState(false);
import { mobileScenicArtUrl, scenicArtForPoint } from "../../scenic-art";
import BottomNav from "../../components/BottomNav.vue";
import { computed } from "vue";
import data from "../../data";
import { state, go, tab, storageStatus } from "../../model/store";
import Icon from "../../components/Icon.vue";
const upcoming = computed(() =>
  state.orders.find((o) => o.kind === "entry" && o.status === "confirmed"),
);
const action = computed(() =>
  upcoming.value?.entered
    ? "继续游览"
    : upcoming.value
      ? "查看预约"
      : "入园预约",
);
const services = [
  {
    name: "AI 问答",
    note: "听懂山水里的故事",
    icon: "message-circle",
    page: "qa/index",
  },
  {
    name: "路线推荐",
    note: "找到适合你的走法",
    icon: "route",
    page: "routes/index",
  },
  {
    name: "服务设施",
    note: "便捷查询身边服务",
    icon: "map-pin",
    page: "guide",
  },
  {
    name: "游客聊天",
    note: "分享这一程的见闻",
    icon: "messages-square",
    page: "chat/index",
  },
];
function mainAction() {
  upcoming.value?.entered
    ? tab("guide")
    : upcoming.value
      ? go("orders/index?id=" + upcoming.value.id)
      : tab("booking");
}
</script>
<template>
  <view
    ><view class="home-top row between"
      ><view class="row"
        ><image
          class="home-logo"
          src="/static/scenic-art/logo.png"
          aria-hidden="true"
        /><text>青岚山境</text></view
      ><text class="subtle"
        >{{ data.snapshot.weather.label }} ·
        {{ formatNumber(data.snapshot.weather.temperature) }}°C</text
      ></view
    ><view class="hero"
      ><image
        class="hero-art"
        :src="mobileScenicArtUrl()"
        mode="aspectFill"
        aria-hidden="true"
      /><text class="kicker">一程山水 · 自在游览</text
      ><view class="title">在山水间，<br />慢下来。</view></view
    ><view class="page"
      ><ScenicStatus /><button class="primary full" @tap="go('scan/index')">扫码识景</button><view
        v-if="storageStatus.invalid || storageStatus.error"
        class="error"
        >{{
          storageStatus.error || "设备记录无法读取，请前往调试工具重置。"
        }}</view
      ><view class="row between"
        ><view
          ><view>开启今天的游览</view
          ><text class="subtle">免费预约 · 从容出发</text></view
        ><button class="primary" @tap="mainAction">{{ action }}</button></view
      ><view class="grid services"
        ><button
          v-for="s in services"
          :key="s.name"
          class="service row"
          @tap="s.page === 'guide' ? tab('guide') : go(s.page)"
        >
          <Icon :name="s.icon" /><view
            ><view>{{ s.name }}</view
            ><text class="subtle">{{ s.note }}</text></view
          >
        </button></view
      ><button class="notice full" @tap="go('content/index?mode=news')">
        游览提示：部分设施养护中，请留意开放状态 ›</button
      ><view class="heading">沿途好风景</view
      ><view
        v-for="p in data.points
          .filter((p) => p.kind === 'attraction')
          .slice(0, 4)"
        :key="p.id"
        class="feature row"
        @tap="go('detail/index?id=' + p.id)"
        ><image
          :src="mobileScenicArtUrl(p.id)"
          :aria-label="scenicArtForPoint(p.id).alt"
          mode="aspectFill" /><view class="grow"
          ><view>{{ p.name }}</view
          ><text class="subtle">{{ p.description }}</text
          ><view
            ><text
              class="badge"
              :class="{ closed: state.closedPoints.includes(p.id) }"
              >{{
                !scenicStatus.ready
                  ? "状态待更新"
                  : state.closedPoints.includes(p.id)
                    ? "暂时关闭"
                    : "开放"
              }}</text
            ></view
          ></view
        ><Icon name="chevron-right" /></view
      ><button class="link full" @tap="tab('guide')">查看全部景点</button
      ><view class="subtle foot">一程山水，自在游览。</view></view
    ></view
  ><BottomNav current="home" />
</template>
<style scoped>
.home-top {
  padding: 16px 20px;
}
.hero {
  height: 278px;
  position: relative;
  overflow: hidden;
  padding: 16px 24px;
  background: linear-gradient(160deg, #f8fcfa, #d5e7df);
}
.hero .title {
  position: relative;
  z-index: 2;
  margin-top: 20px;
  font-size: 38px;
}
.kicker {
  font-size: 12px;
  letter-spacing: 2px;
  color: #536b63;
}
/* The left reading area stays quiet over the shared panorama. */
.home-logo {
  width: 28px;
  height: 28px;
  margin-right: 8px;
}
.hero-art {
  position: absolute;
  right: 0;
  bottom: -10%;
  width: 100%;
  height: 105%;
}
.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    #eaf3ef 0%,
    rgba(234, 243, 239, 0.88) 28%,
    rgba(234, 243, 239, 0) 72%
  );
  pointer-events: none;
}
.hero .kicker {
  position: relative;
  z-index: 2;
}
.services {
  margin: 24px 0;
}
.service {
  text-align: left;
  padding: 14px 10px;
  gap: 8px;
  border-radius: 20px;
}
.service .subtle {
  font-size: 10px;
  white-space: nowrap;
}
.notice {
  text-align: left;
  font-size: 13px;
  padding: 12px;
  margin: 20px 0;
  background: #dceae3;
  color: #536b63;
}
.feature {
  padding: 16px 0;
  border-bottom: 1px solid #d4e2db;
}
.feature image {
  height: 82px;
  width: 76px;
  border-radius: 12px;
  flex-shrink: 0;
}
.feature .subtle {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 5px 0;
}
.foot {
  text-align: center;
  margin-top: 24px;
}
</style>
