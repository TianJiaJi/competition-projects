<script setup lang="ts">
import {tourAction} from "../../services/platform";
import ScenicStatus from "../../components/ScenicStatus.vue";
import {
  useScenicState,
  refreshScenicState,
  scenicStatus,
} from "../../services/scenic-state";
useScenicState(true);
import BottomNav from "../../components/BottomNav.vue";
import { computed, ref, onUnmounted } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import data, { pointById } from "../../data";
import { state, go, save, act } from "../../model/store";
import ScenicMap from "../../components/ScenicMap.vue";
import Icon from "../../components/Icon.vue";
const category = ref("attraction"),
  selected = ref(""),
  expanded = ref(false),
  map = ref<InstanceType<typeof ScenicMap>>();
const filters = [
  ["attraction", "景点"],
  ["toilet", "卫生间"],
  ["cable", "索道"],
];
const point = computed(() => pointById[selected.value]);
const route = computed(() =>
  data.routes.find((r) => r.id === state.tour?.routeId),
);
const blocked = computed(
  () =>
    route.value &&
    (route.value.nodeIds.some((id) => state.closedPoints.includes(id)) ||
      route.value.edgeIds.some((id) => state.closedEdges.includes(id))),
);
onShow(() => {
  const id = uni.getStorageSync("mobile-focus");
  if (id && pointById[id]?.kind !== "parking") {
    selected.value = id;
    category.value = pointById[id]?.kind || "attraction";
    uni.removeStorageSync("mobile-focus");
  }
});
async function play() {
 if(!state.tour)return;
 try{await tourAction(state.tour.routeId,state.tour.status==='running'?'pause':'start');}catch(e){uni.showToast({title:(e as Error).message,icon:'none'});}
}
</script>
<template>
  <view class="page"
    ><button class="primary full" @tap="go('scan/index')">扫码识景</button><ScenicStatus /><view class="row between"
      ><view class="title">山水导览</view
      ><text class="badge">路线预览位置</text></view
    ><view class="row filters"
      ><button
        v-for="f in filters"
        :key="f[0]"
        class="chip grow"
        :class="{ selected: category === f[0] }"
        @tap="
          category = f[0];
          selected = '';
        "
      >
        {{ f[1] }}
      </button></view
    ><ScenicMap
      ref="map"
      :category="category"
      :selected="selected"
      :route-id="state.tour?.routeId"
      :progress="state.tour?.progress"
      @select="
        selected = $event;
        expanded = false;
      "
    /><view class="row wrap"
      ><button class="link" @tap="map?.reset()">恢复全景</button
      ><button class="link" @tap="go('content/index?mode=search')">
        搜索景点</button
      ><button class="link" @tap="go('routes/index')">路线推荐</button></view
    >
    <view v-if="point" class="panel"
      ><view class="row between"
        ><view class="heading">{{ point.name }}</view
        ><button class="link" @tap="selected = ''">关闭</button></view
      ><text
        class="badge"
        :class="{ closed: state.closedPoints.includes(point.id) }"
        >{{
          !scenicStatus.ready
            ? "状态待更新"
            : state.closedPoints.includes(point.id)
              ? "暂时关闭"
              : "开放"
        }}</text
      ><view class="body spacer-text">{{ point.description }}</view
      ><view v-if="expanded"
        ><view class="subtle">开放时间：{{ point.hours }}</view
        ><view class="row wrap spacer-text"
          ><button class="secondary" @tap="go('qa/index?poiId=' + point.id)">
            问问 AI</button
          ><button class="secondary" @tap="go('chat/index?room=' + point.id)">
            景点聊天
          </button></view
        ></view
      ><view class="row"
        ><button class="secondary grow" @tap="expanded = !expanded">
          {{ expanded ? "收起" : "展开" }}详情</button
        ><button class="primary grow" @tap="go('detail/index?id=' + point.id)">
          查看介绍
        </button></view
      ></view
    >
    <view v-if="route" class="panel"
      ><view class="heading">{{ route.name }}</view
      ><view class="subtle"
        >约 {{ (route.distance / 1000).toFixed(2) }} 公里 ·
        {{ route.minutes }} 分钟 · 预计用时</view
      ><view v-if="blocked" class="error">路线受关闭状态影响，请重新选择。</view
      ><view class="tour-state"
        >{{ state.tour?.orderId ? "已入园批次" : "未入园 · 路线预览" }} ·
        {{ Math.round((state.tour?.progress || 0) * 100) }}%</view
      ><view class="row"
        ><button class="secondary grow" @tap="go('routes/index')">换路线</button
        ><button class="primary grow" :disabled="!!blocked" @tap="play">
          {{
            state.tour?.status === "running"
              ? "暂停"
              : state.tour?.status === "completed"
                ? "重新预览"
                : "开始 / 继续"
          }}
        </button></view
      ></view
    >
    <view v-else-if="!point" class="panel"
      ><view class="heading">沿着山水，自在走走</view
      ><view class="subtle">点选景点，查看介绍与开放状态。</view
      ><button class="primary full spacer-text" @tap="go('routes/index')">
        按偏好推荐路线
      </button></view
    >
    <view class="panel"
      ><view class="heading">{{
        filters.find((f) => f[0] === category)?.[1] || "全部点位"
      }}</view
      ><view
        v-for="(p, i) in data.points.filter((p) => p.kind === category)"
        :key="p.id"
        class="list-item row between"
        @tap="
          selected = p.id;
          expanded = false;
        "
        ><text
          >{{ category === "attraction" ? "" : i + 1 + " · "
          }}{{ p.name }}</text
        ><text class="subtle"
          >{{
            !scenicStatus.ready
              ? "状态待更新"
              : state.closedPoints.includes(p.id)
                ? "关闭"
                : "查看"
          }}
          ›</text
        ></view
      ></view
    ></view
  ><BottomNav current="guide" />
</template>
<style scoped>
.filters {
  gap: 6px;
  margin-bottom: 12px;
}
.filters .chip {
  padding: 10px 4px;
  font-size: 13px;
}
.spacer-text {
  margin: 18px 0;
}
.tour-state {
  margin: 16px 0;
  color: #255d78;
  font-size: 14px;
}
</style>
