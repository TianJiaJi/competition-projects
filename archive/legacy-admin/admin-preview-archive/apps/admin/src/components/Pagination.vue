<script setup lang="ts">
import { PAGE_SIZES } from "../services/list";

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}>();
const emit = defineEmits<{ "update:page": [number]; "update:pageSize": [number] }>();

function go(page: number) {
  const target = Math.min(Math.max(1, page), Math.max(1, props.pageCount));
  if (target !== props.page) emit("update:page", target);
}
</script>

<template>
  <div class="pager">
    <span class="pager__info num">
      共 {{ total }} 条，第 {{ page }} / {{ Math.max(1, pageCount) }} 页
    </span>
    <div class="pager__controls">
      <label class="inline-note" :for="'page-size-select'">每页</label>
      <select
        id="page-size-select"
        class="select"
        style="width: auto; min-height: 32px"
        :value="String(pageSize)"
        @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="size in PAGE_SIZES" :key="size" :value="String(size)">{{ size }}</option>
      </select>
      <button class="btn btn--sm" type="button" :disabled="page <= 1" @click="go(1)">首页</button>
      <button class="btn btn--sm" type="button" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <button class="btn btn--sm" type="button" :disabled="page >= pageCount" @click="go(page + 1)">下一页</button>
      <button class="btn btn--sm" type="button" :disabled="page >= pageCount" @click="go(pageCount)">末页</button>
    </div>
  </div>
</template>
