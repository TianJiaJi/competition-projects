<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { RecordItem } from "@scene/domain";
import { LiquidGlassButton, LiquidGlassSurface } from "@scene/ui/liquid-glass";
import { Search, ArrowUpRight, Plus } from "lucide-vue-next";
import StatusTag from "./StatusTag.vue";
const props = withDefaults(
  defineProps<{
    items: RecordItem[];
    title: string;
    editable?: boolean;
    cards?: boolean;
  }>(),
  { editable: false, cards: false },
);
const emit = defineEmits<{ select: [RecordItem]; create: [] }>();
const query = ref(""),
  status = ref(""),
  page = ref(1);
const size = 6;
const statuses = computed(() => [...new Set(props.items.map((r) => r.status))]);
const filtered = computed(() =>
  props.items.filter(
    (r) =>
      (!status.value || r.status === status.value) &&
      `${r.title} ${r.location} ${r.category} ${r.id}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / size)),
);
const visible = computed(() =>
  filtered.value.slice((page.value - 1) * size, page.value * size),
);
watch([query, status], () => (page.value = 1));
watch(pageCount, (n) => (page.value = Math.min(page.value, n)));
function tone(s: string) {
  return ["正常", "已完成", "已发布", "已认证", "开放", "使用中", "已预约"].includes(s)
    ? "success"
    : ["待处理", "待审核", "检修中", "关注"].includes(s)
      ? "warning"
    : s === "已拒绝"
      ? "danger"
      : "info";
}
</script>
<template>
  <section class="record-section">
    <div class="list-toolbar">
      <label class="search-field"
        ><Search :size="17" /><input
          v-model="query"
          :aria-label="'搜索' + title"
          placeholder="搜索名称、位置或编号" /></label
      ><select v-model="status" aria-label="状态筛选">
        <option value="">全部状态</option>
        <option v-for="s in statuses" :key="s">{{ s }}</option></select
      ><LiquidGlassButton v-if="editable" @click="emit('create')"
        ><Plus :size="17" />新增</LiquidGlassButton
      >
    </div>
    <div v-if="!visible.length" class="empty">
      <h3>暂时没有匹配的记录</h3>
      <p>试试其他关键词，或清除筛选条件。</p>
      <button
        @click="
          query = '';
          status = '';
        "
      >
        清除筛选
      </button>
    </div>
    <div v-else-if="cards" class="record-grid">
      <LiquidGlassSurface
        v-for="(item, i) in visible"
        :key="item.id"
        class="record-card"
        :radius="20"
        ><button class="card-hit" @click="emit('select', item)">
          <span class="card-number">{{
            String((page - 1) * size + i + 1).padStart(2, "0")
          }}</span
          ><StatusTag :label="item.status" :tone="tone(item.status)" />
          <h3>{{ item.title }}</h3>
          <p class="muted">{{ item.location }} · {{ item.category }}</p>
          <p class="card-description">{{ item.description }}</p>
          <span class="card-footer"
            >查看详情 <ArrowUpRight :size="19"
          /></span></button
      ></LiquidGlassSurface>
    </div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>位置</th>
            <th>分类</th>
            <th>状态</th>
            <th>日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in visible" :key="item.id">
            <td>
              <strong>{{ item.title }}</strong
              ><small>{{ item.id }}</small>
            </td>
            <td>{{ item.location }}</td>
            <td>{{ item.category }}</td>
            <td>
              <StatusTag :label="item.status" :tone="tone(item.status)" />
            </td>
            <td>{{ item.date }}</td>
            <td>
              <button
                class="text-button"
                :aria-label="'查看' + item.title"
                @click="emit('select', item)"
              >
                查看 <ArrowUpRight :size="15" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="pagination">
      <span>共 {{ filtered.length }} 条 · {{ page }} / {{ pageCount }} 页</span>
      <div>
        <LiquidGlassButton :disabled="page <= 1" @click="page--"
          >上一页</LiquidGlassButton
        ><LiquidGlassButton :disabled="page >= pageCount" @click="page++"
          >下一页</LiquidGlassButton
        >
      </div>
    </footer>
  </section>
</template>
