<script setup lang="ts">
import {tourAction} from "../../services/platform";
import ScenicStatus from "../../components/ScenicStatus.vue";
import {
  useScenicState,
  refreshScenicState,
  scenicStatus,
} from "../../services/scenic-state";
useScenicState(false);
import { reactive, ref, computed } from "vue";
import data from "../../data";
import { state, act, tab } from "../../model/store";
import { matchingRoutes } from "../../model/domain";
import type { Preferences } from "../../model/types";
import ScenicMap from "../../components/ScenicMap.vue";
const preferences = reactive<Preferences>({
  hours: 2,
  interests: ["自然", "摄影"],
  pace: "轻松",
  elderly: false,
  children: false,
  accessible: false,
  required: [],
  avoidBusy: true,
});
const expanded = ref(false),
  show = ref(false),
  detail = ref("");
const routes = computed(() =>
  scenicStatus.ready ? matchingRoutes(state, preferences) : [],
);
function toggle(list: string[], value: string) {
  const i = list.indexOf(value);
  i < 0 ? list.push(value) : list.splice(i, 1);
  show.value = false;
}
function setFlag(
  key: "elderly" | "children" | "accessible" | "avoidBusy",
  event: unknown,
) {
  preferences[key] = (event as { detail: { value: boolean } }).detail.value;
  show.value = false;
}
async function choose(id: string) {
  if (!(await refreshScenicState())) return;
  try {await tourAction(id,'select');tab('guide');}catch(e){uni.showToast({title:(e as Error).message,icon:'none'});}
}
</script>
<template>
  <view class="page"
    ><ScenicStatus /><view class="title">按你的节奏，<br />走进山水。</view
    ><view class="subtle">选好偏好，为这一程留一点余裕。</view
    ><view class="label">准备逛多久</view
    ><view class="row wrap"
      ><button
        v-for="h in [1, 2, 3, 4]"
        :key="h"
        class="chip"
        :class="{ selected: preferences.hours === h }"
        @tap="
          preferences.hours = h;
          show = false;
        "
      >
        {{ h }} 小时
      </button></view
    ><view class="label">更想看什么 · 可多选</view
    ><view class="row wrap"
      ><button
        v-for="i in ['自然', '古建', '文物', '摄影', '亲子']"
        :key="i"
        class="chip"
        :class="{ selected: preferences.interests.includes(i) }"
        @tap="toggle(preferences.interests, i)"
      >
        {{ i }}
      </button></view
    ><view class="label">游览节奏</view
    ><view class="row wrap"
      ><button
        v-for="p in ['轻松', '标准', '紧凑'] as const"
        :key="p"
        class="chip"
        :class="{ selected: preferences.pace === p }"
        @tap="
          preferences.pace = p;
          show = false;
        "
      >
        {{ p }}
      </button></view
    ><view class="panel"
      ><button class="link full" @tap="expanded = !expanded">
        同行与其他条件 {{ expanded ? "收起" : "展开" }}</button
      ><view class="subtle">{{
        [
          preferences.elderly ? "老人" : "",
          preferences.children ? "儿童" : "",
          preferences.accessible ? "无障碍" : "",
          preferences.avoidBusy ? "避拥堵" : "",
          ...preferences.required.map(
            (id) => data.points.find((p) => p.id === id)?.name,
          ),
        ]
          .filter(Boolean)
          .join(" · ") || "不限"
      }}</view
      ><view v-if="expanded"
        ><view
          v-for="option in [
            ['elderly', '有老人同行'],
            ['children', '有儿童同行'],
            ['accessible', '需要无障碍路线'],
            ['avoidBusy', '尽量避开拥堵'],
          ] as const"
          :key="option[0]"
          class="row between list-item"
          ><text>{{ option[1] }}</text
          ><switch
            :checked="preferences[option[0]]"
            color="#175f54"
            @change="setFlag(option[0], $event)" /></view
        ><view class="label">必去景点 · 可多选</view
        ><view class="row wrap"
          ><button
            v-for="p in data.points.filter((p) => p.kind === 'attraction')"
            :key="p.id"
            class="chip"
            :class="{ selected: preferences.required.includes(p.id) }"
            @tap="toggle(preferences.required, p.id)"
          >
            {{ p.name }}
          </button></view
        ></view
      ></view
    ><button
      class="primary full"
      @tap="
        show = true;
        detail = '';
      "
    >
      推荐路线</button
    ><view v-if="show && scenicStatus.ready"
      ><view v-if="!routes.length" class="error"
        >暂无满足条件的路线：可能超出时长、包含关闭点位，或同行条件与模板不匹配。请减少必去点、增加时长或调整条件。</view
      ><view v-for="r in routes" :key="r.id" class="panel"
        ><view class="heading">{{ r.name }}</view
        ><text class="subtle"
          >约 {{ (r.distance / 1000).toFixed(2) }} 公里 ·
          {{ r.minutes }} 分钟基础耗时</text
        ><view class="body reason">{{ r.reason }}</view
        ><view class="subtle">{{
          r.stops
            .map((id) => data.points.find((p) => p.id === id)?.name)
            .filter(Boolean)
            .join(" → ")
        }}</view
        ><ScenicMap v-if="detail === r.id" :route-id="r.id" /><view
          class="row buttons"
          ><button
            class="secondary grow"
            @tap="detail = detail === r.id ? '' : r.id"
          >
            {{ detail === r.id ? "收起地图" : "路线地图" }}</button
          ><button class="primary grow" @tap="choose(r.id)">
            选用路线
          </button></view
        ></view
      ></view
    ><view class="subtle note"
      >依据游览偏好和景区开放状态筛选路线。距离与用时仅供参考，无障碍条件请以现场指引为准。</view
    ></view
  >
</template>
<style scoped>
.reason {
  margin: 16px 0;
}
.buttons {
  margin-top: 18px;
}
.note {
  margin: 20px 0;
}
</style>
