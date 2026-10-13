<script setup lang="ts">
import { cachedFilters } from "../app/filter-cache";
import { onMounted, reactive, ref } from "vue";
import { pointById, points } from "@scenic/scenic";
import { pushToast } from "../app/state";
import type { KnowledgeEntry } from "../core/types";
import { getKnowledge, getSource, listKnowledge } from "../services/content";
import type { ListResult } from "../services/list";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
import FilterBar from "../components/FilterBar.vue";
import FormField from "../components/FormField.vue";
import MarkdownPreview from "../components/MarkdownPreview.vue";
import PageHeader from "../components/PageHeader.vue";
import Pagination from "../components/Pagination.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

interface KnowledgeRow extends KnowledgeEntry {
  poiName: string | null;
}

const filters = cachedFilters("knowledge", { keyword: "", poiId: "all", retrievalStatus: "all", page: 1, pageSize: 20 });
const result = ref<ListResult<KnowledgeRow> | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const detail = ref<KnowledgeEntry | null>(null);
const sourceText = ref<string | null>(null);
const detailOpen = ref(false);

const poiOptions = [
  { value: "all", label: "全部景点" },
  ...points.filter((point) => point.kind === "attraction").map((point) => ({ value: point.id, label: point.name })),
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await listKnowledge({
    keyword: filters.keyword,
    poiId: filters.poiId,
    retrievalStatus: filters.retrievalStatus as KnowledgeEntry["retrievalStatus"] | "all",
    page: filters.page,
    pageSize: filters.pageSize,
  });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  result.value = response.data;
}

async function search(): Promise<void> {
  filters.page = 1;
  await load();
}

async function reset(): Promise<void> {
  filters.keyword = "";
  filters.poiId = "all";
  filters.retrievalStatus = "all";
  filters.page = 1;
  await load();
}

async function openDetail(id: string): Promise<void> {
  const response = await getKnowledge(id);
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  detail.value = response.data;
  detailOpen.value = true;
  sourceText.value = null;
  const source = await getSource(response.data.sourceId);
  sourceText.value = source.ok
    ? `${source.data.title} · ${source.data.publisher}${source.data.publishedAt ? ` · ${source.data.publishedAt}` : ""}`
    : `来源缺失（${response.data.sourceId}）：本地样例没有该来源记录，不伪造出处`;
}

onMounted(load);
</script>

<template>
  <section class="stack">
    <PageHeader
      title="知识查看"
      description="只读检索知识条目与来源；不提供编辑、启用、上传、向量索引或调用模型按钮。"
    />

    <FilterBar :busy="loading" @submit="search" @reset="reset">
      <FormField label="关键词" field="knowledge-keyword">
        <TextInput id="knowledge-keyword" v-model="filters.keyword" placeholder="标题、正文或关键词" />
      </FormField>
      <FormField label="关联景点" field="knowledge-poi">
        <SelectInput id="knowledge-poi" v-model="filters.poiId" :options="poiOptions" />
      </FormField>
      <FormField label="检索状态" field="knowledge-status">
        <SelectInput
          id="knowledge-status"
          v-model="filters.retrievalStatus"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'ready', label: '可用' },
            { value: 'disabled', label: '已停用' },
          ]"
        />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'title', label: '标题' },
            { key: 'poiName', label: '关联景点' },
            { key: 'keywords', label: '关键词' },
            { key: 'sourceId', label: '来源' },
            { key: 'version', label: '版本' },
            { key: 'retrievalStatus', label: '检索状态' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          empty-text="没有匹配的知识条目，可调整关键词或景点筛选。"
        >
          <template #cell-poiName="{ row }">
            {{ row.poiName ?? "—" }}
          </template>
          <template #cell-keywords="{ row }">
            <span class="muted small">{{ (row.keywords as string[]).join("、") || "—" }}</span>
          </template>
          <template #cell-retrievalStatus="{ row }">
            <StatusTag :label="row.retrievalStatus === 'ready' ? '可用' : '已停用'" :tone="row.retrievalStatus === 'ready' ? 'success' : 'neutral'" />
          </template>
          <template #cell-actions="{ row }">
            <AdminButton size="sm" @click="openDetail(String(row.id))">查看详情</AdminButton>
          </template>
        </DataTable>
        <Pagination
          v-if="result"
          :page="result.page"
          :page-size="result.pageSize"
          :total="result.total"
          :page-count="result.pageCount"
          @update:page="(page) => { filters.page = page; load(); }"
          @update:page-size="(size) => { filters.pageSize = size; filters.page = 1; load(); }"
        />
      </AsyncSection>
    </div>

    <DrawerPanel v-if="detailOpen && detail" :title="detail.title" subtitle="知识详情（只读）" @close="detailOpen = false">
      <dl class="definition-list">
        <dt>关联景点</dt>
        <dd>{{ detail.poiId ? pointById[detail.poiId]?.name ?? detail.poiId : "—" }}</dd>
        <dt>关键词</dt>
        <dd>{{ detail.keywords.join("、") || "—" }}</dd>
        <dt>版本</dt>
        <dd class="num">{{ detail.version }}</dd>
        <dt>检索状态</dt>
        <dd>
          <StatusTag :label="detail.retrievalStatus === 'ready' ? '可用' : '已停用（仍可供员工查阅）'" :tone="detail.retrievalStatus === 'ready' ? 'success' : 'neutral'" />
        </dd>
        <dt>完整来源</dt>
        <dd>{{ sourceText ?? "读取中…" }}</dd>
      </dl>
      <div>
        <p class="section-title">正文（安全渲染）</p>
        <MarkdownPreview :source="detail.body" />
      </div>
      <template #footer>
        <AdminButton @click="detailOpen = false">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
