<script setup lang="ts">
import ScenicStatus from "../../components/ScenicStatus.vue";
import {
  useScenicState,
  refreshScenicState,
  scenicStatus,
} from "../../services/scenic-state";
useScenicState(false);
import { mobileScenicArtUrl, scenicArtForPoint } from "../../scenic-art";
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import data, { pointById } from "../../data";
import { state, go, tab, toggleFavourite } from "../../model/store";
const id = ref("");
onLoad((q) => (id.value = q?.id || ""));
const point = computed(() => pointById[id.value]);
const details = computed(
  () =>
    (
      data.snapshot.points as Record<
        string,
        { reason?: string; parkingFree?: number; parkingCapacity?: number }
      >
    )[id.value],
);
function onMap() {
  uni.setStorageSync("mobile-focus", id.value);
  tab("guide");
}
</script>
<template>
  <view class="page"
    ><ScenicStatus /><template v-if="point"
      ><image
        class="detail-image"
        :src="mobileScenicArtUrl(id)"
        :aria-label="scenicArtForPoint(id).alt"
        mode="aspectFill"
      /><view class="subtle">青岚山境 · 景观插画</view
      ><view class="title">{{ point.name }}</view
      ><text
        class="badge"
        :class="{ closed: state.closedPoints.includes(id) }"
        >{{
          !scenicStatus.ready
            ? "状态待更新"
            : state.closedPoints.includes(id)
              ? "暂时关闭"
              : "开放"
        }}</text
      ><view class="panel reading-panel"
        ><view class="heading">游览介绍</view
        ><view class="body">{{ point.description }}</view
        ><view class="divider" /><view class="subtle"
          >开放时间：{{ point.hours }}</view
        ><view v-if="state.closedPoints.includes(id)" class="error">{{
          details?.reason || "当前设施暂未开放，请选择其他点位。"
        }}</view
        ><view v-if="point.services?.length" class="subtle"
          >服务：{{ point.services.join("、") }}</view
        ><view v-if="point.kind === 'parking'" class="subtle"
          >空位 {{ details?.parkingFree ?? "未知" }} /
          {{
            details?.parkingCapacity ?? "未知"
          }}（参考信息；预约不保留实际车位）</view
        ><view v-if="point.kind === 'toilet'" class="subtle"
          >设施开放状态以当前景区资料为准，请留意现场指引。</view
        ><view v-if="point.kind === 'cable'" class="subtle"
          >请按现场指引乘坐；索道与步行路线分别查看。</view
        ></view
      ><view class="row wrap"
        ><button class="secondary grow" @tap="go('qa/index?poiId=' + id)">
          问问 AI</button
        ><button class="secondary grow" @tap="toggleFavourite(id)">
          {{ state.favourites.includes(id) ? "已收藏" : "收藏" }}</button
        ><button class="secondary grow" @tap="go('chat/index?room=' + id)">
          聊天室
        </button></view
      ><button
        v-if="point.kind !== 'parking'"
        class="primary full map-action"
        @tap="onMap"
      >
        在地图查看</button
      ><view class="subtle">来源：青岚山境景点资料。</view></template
    ><view v-else class="empty">该内容不存在，请返回导览重新选择。</view></view
  >
</template>
<style scoped>
.detail-image {
  width: 100%;
  height: 230px;
  border-radius: 20px;
  background: #dceae3;
}
.map-action {
  margin: 20px 0;
}
</style>
