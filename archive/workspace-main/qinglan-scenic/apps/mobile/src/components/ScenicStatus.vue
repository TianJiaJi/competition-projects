<script setup lang="ts">
import { scenicStatus, refreshScenicState } from "../services/scenic-state";
</script>
<template>
  <view v-if="scenicStatus.error" class="error" role="status"
    >{{ scenicStatus.error
    }}<button class="link" @tap="refreshScenicState">重新加载</button></view
  >
  <view v-else-if="!scenicStatus.ready" class="subtle" role="status"
    >正在更新景区状态…</view
  >
</template>
