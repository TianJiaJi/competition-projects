<script setup lang="ts">
import ScenicStatus from "../../components/ScenicStatus.vue";
import { useScenicState, scenicStatus } from "../../services/scenic-state";
useScenicState();
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import data from "../../data";
import { state, go } from "../../model/store";
const mode = ref("news"),
  query = ref(""),
  error = ref("");
onLoad((q) => (mode.value = q?.mode || "news"));
const found = computed(() =>
  data.points.filter(
    (p) =>
      (mode.value !== "favourites" || state.favourites.includes(p.id)) &&
      (!query.value ||
        p.name.includes(query.value) ||
        p.description.includes(query.value)),
  ),
);
function scan() { go('scan/index'); }
</script>
<template>
  <view class="page"
    ><ScenicStatus /><view class="title">{{
      mode === "favourites"
        ? "我的收藏"
        : mode === "search"
          ? "搜索与扫码"
          : "游览资讯"
    }}</view
    ><template v-if="mode === 'news'"
      ><view class="panel reading-panel"
        ><view class="heading">青岚山境游览须知</view
        ><view class="body"
          >景区08:00 开园，17:00 停止入园，18:00
          闭园。免费分时预约，无支付环节。
          游览前请查看地图上的开放状态，部分设施可能处于养护状态。路线推荐会过滤关闭点位和道路。
          停车预约独立办理，不承诺实体车位。设施信息请以现场指引为准。</view
        ></view
      ><view
        v-for="item in data.snapshot.announcements"
        :key="item.id"
        class="panel reading-panel"
        ><view class="heading">{{ item.title }}</view
        ><view class="body">{{ item.body }}</view></view
      ><button class="primary full" @tap="go('qa/index')">
        还有问题？问问 AI
      </button></template
    ><template v-else
      ><input v-model="query" placeholder="搜索景点或设施名称" /><view
        v-if="mode === 'search'"
        class="panel reading-panel"
        ><button class="primary full" @tap="scan">扫描景点介绍码</button
        ></view
      ><view
        v-for="p in found"
        :key="p.id"
        class="panel reading-panel"
        @tap="go('detail/index?id=' + p.id)"
        ><view class="row between"
          ><text>{{ p.name }}</text
          ><text
            class="badge"
            :class="{ closed: state.closedPoints.includes(p.id) }"
            >{{
              !scenicStatus.ready
                ? "状态待更新"
                : state.closedPoints.includes(p.id)
                  ? "关闭"
                  : "开放"
            }}</text
          ></view
        ><view class="subtle note">{{ p.description }}</view></view
      ><view v-if="!found.length" class="empty">{{
        mode === "favourites" ? "还没有收藏喜欢的景点。" : "没有找到相关内容。"
      }}</view></template
    ></view
  >
</template>
<style scoped>
.note {
  margin: 12px 0;
}
</style>
