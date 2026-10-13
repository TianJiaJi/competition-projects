<script setup lang="ts">
import { scenicStatus, refreshScenicState } from "../services/scenic-state";
</script>
<template>
  <view v-if="scenicStatus.error" class="error scenic-status" role="status"
    >{{ scenicStatus.error
    }}<button class="link" @tap="refreshScenicState">重新加载</button></view
  >
  <view v-else-if="!scenicStatus.ready" class="subtle scenic-status" role="status"
    >正在更新景区状态…</view
  >
</template>

<style scoped>
.scenic-status{position:fixed;left:16px;right:16px;top:50px;z-index:90;padding:8px 12px;background:#f8fcfa;box-shadow:0 4px 12px #193b3520;border-radius:12px;font-size:13px;pointer-events:auto}
</style>
