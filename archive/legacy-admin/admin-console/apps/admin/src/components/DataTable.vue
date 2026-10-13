<script setup lang="ts">
export interface TableColumn {
  key: string;
  label: string;
  width?: string;
}

withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: Array<Record<string, unknown>>;
    rowKey: (row: Record<string, unknown>) => string;
    caption?: string;
    loading?: boolean;
    error?: string;
    emptyText?: string;
  }>(),
  { emptyText: "没有符合条件的数据。", caption: "" },
);
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="stack">
    <div v-if="loading" class="async-state" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true" />
      <span>正在读取数据…</span>
      <div class="skeleton-lines" aria-hidden="true"><span /><span /><span /></div>
    </div>
    <div v-else-if="error" class="async-state" role="alert">
      <strong>读取失败</strong>
      <span>{{ error }}</span>
      <button class="btn" type="button" @click="$emit('retry')">重试</button>
    </div>
    <div v-else-if="!rows.length" class="async-state">
      <strong>没有数据</strong>
      <span>{{ emptyText }}</span>
      <slot name="empty" />
    </div>
    <div v-else class="table-scroll">
      <table class="data-table">
        <caption v-if="caption">{{ caption }}</caption>
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.key" :style="column.width ? { width: column.width } : undefined" scope="col">
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="rowKey(row)">
            <td v-for="column in columns" :key="column.key" :class="column.key === 'actions' ? 'actions' : undefined">
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ row[column.key] ?? "—" }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
