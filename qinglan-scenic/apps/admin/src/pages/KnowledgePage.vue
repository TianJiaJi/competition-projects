<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api } from "../services/store";
import { useLiveRefresh } from "../app/live-refresh";
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import PageHeader from "../components/PageHeader.vue";
import AdminButton from "../components/AdminButton.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
import AsyncSection from "../components/AsyncSection.vue";
import { points } from "@scenic/scenic";
import { askConfirm } from "../app/state";

type KnowledgeRow = {
  id: string;
  title: string;
  body: string;
  poiId?: string | null;
  keywords?: string[];
  sourceId?: string;
  version: number;
  published?: boolean;
  disabled?: boolean;
  deleted?: boolean;
};
const pageSize = 12;
const rows = ref<KnowledgeRow[]>([]);
const keyword = ref("");
const page = ref(1);
const total = ref(0);
const listError = ref("");
const editorError = ref("");
const loading = ref(false);
const busy = ref(false);
const open = ref(false);
const form = reactive({ id: "", title: "", body: "", poiId: "", keywords: "", sourceId: "景区管理方", version: 0 });
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
let requestId = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function load() {
  const current = ++requestId;
  loading.value = true;
  listError.value = "";
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (keyword.value.trim()) params.set("q", keyword.value.trim());
    const response = await api.request<{ items: KnowledgeRow[]; total: number }>(`/admin/knowledge?${params}`);
    if (current !== requestId) return;
    rows.value = response.items;
    total.value = response.total;
    if (!rows.value.length && page.value > 1) { page.value--; return; }
  } catch (e) {
    if (current === requestId) listError.value = (e as Error).message;
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(keyword, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; void load(); }, 250);
});
watch(page, () => void load());
function edit(row?: KnowledgeRow) {
  Object.assign(form, row
    ? { ...row, poiId: row.poiId || "", keywords: (row.keywords || []).join("、"), sourceId: row.sourceId || "景区管理方" }
    : { id: "", title: "", body: "", poiId: "", keywords: "", sourceId: "景区管理方", version: 0 });
  editorError.value = "";
  open.value = true;
}
async function save(published: boolean) {
  if (busy.value) return;
  editorError.value = "";
  if (!form.title.trim() || !form.body.trim() || !form.sourceId.trim()) {
    editorError.value = "请填写标题、正文和来源。";
    return;
  }
  busy.value = true;
  try {
    await api.request("/admin/knowledge" + (form.id ? "/" + form.id : ""), "POST", {
      ...form,
      keywords: form.keywords.split(/[、,，]/).map(s => s.trim()).filter(Boolean),
      published,
      expectedVersion: form.version,
    });
    open.value = false;
    page.value = 1;
    await load();
  } catch (e) {
    editorError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function action(row: KnowledgeRow, operation: "disable" | "delete") {
  if (operation === "delete" && !(await askConfirm({
    title: "删除知识条目", message: "删除后停止检索，历史版本和引用保留。", confirmText: "删除", danger: true,
  }))) return;
  busy.value = true;
  listError.value = "";
  try {
    await api.request("/admin/knowledge/" + row.id, "POST", { action: operation, expectedVersion: row.version });
    await load();
  } catch (e) {
    listError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
useLiveRefresh(load);
</script>

<template>
  <FlowPage>
    <PageHeader title="知识库管理" description="管理 AI 问答使用的景区知识与来源。">
      <template #actions><AdminButton variant="primary" @click="edit()">新增知识</AdminButton></template>
    </PageHeader>
    <FlowPanel class="knowledge-panel">
      <div class="knowledge-toolbar">
        <label for="knowledge-search">搜索知识</label>
        <input id="knowledge-search" class="input" v-model="keyword" type="search" placeholder="搜索标题、正文或关键词" />
        <span class="muted small">共 {{ total }} 条</span>
      </div>
      <p class="knowledge-hint muted small">发布版本用于 AI 问答；保存草稿保留上次发布版本。停用后不再检索，历史引用仍可追溯。</p>
      <AsyncSection :retain="rows.length > 0" :loading="loading" :error="listError || undefined" :empty="!rows.length" empty-text="没有匹配的知识条目。" @retry="load">
        <div class="knowledge-list">
          <article v-for="row in rows" :key="row.id" class="knowledge-row">
            <div class="knowledge-row__content">
              <div class="knowledge-row__heading"><h2>{{ row.title }}</h2><span class="knowledge-status" :class="row.disabled ? 'knowledge-status--disabled' : row.published ? 'knowledge-status--published' : ''">{{ row.disabled ? "已停用" : row.published ? "已发布" : "草稿" }}</span></div>
              <p class="knowledge-row__meta muted small">版本 {{ row.version }} · 来源 {{ row.sourceId || "景区管理方" }}</p>
              <p class="knowledge-row__excerpt">{{ row.body }}</p>
            </div>
            <div class="knowledge-row__actions">
              <AdminButton size="sm" @click="edit(row)">查看 / 编辑</AdminButton>
              <AdminButton v-if="!row.disabled" size="sm" :disabled="busy" @click="action(row, 'disable')">停用</AdminButton>
              <AdminButton size="sm" variant="danger" :disabled="busy" @click="action(row, 'delete')">删除</AdminButton>
            </div>
          </article>
        </div>
      </AsyncSection>
      <nav v-if="total > pageSize" class="knowledge-pagination" aria-label="知识库分页">
        <span class="muted small">第 {{ page }} / {{ pageCount }} 页</span>
        <div class="btn-group"><AdminButton size="sm" :disabled="page <= 1 || loading" @click="page--">上一页</AdminButton><AdminButton size="sm" :disabled="page >= pageCount || loading" @click="page++">下一页</AdminButton></div>
      </nav>
    </FlowPanel>
    <DrawerPanel v-if="open" :title="form.id ? '编辑知识' : '新增知识'" @close="open = false">
      <p v-if="editorError" class="form-error-banner" role="alert">{{ editorError }}</p>
      <label class="knowledge-field">标题<input class="input" v-model="form.title" maxlength="120" /></label>
      <label class="knowledge-field">关联景点<select class="select" v-model="form.poiId"><option value="">通用知识</option><option v-for="point in points" :key="point.id" :value="point.id">{{ point.name }}</option></select></label>
      <label class="knowledge-field">关键词（顿号分隔）<input class="input" v-model="form.keywords" /></label>
      <label class="knowledge-field">来源名称或编号<input class="input" v-model="form.sourceId" maxlength="200" /></label>
      <label class="knowledge-field">正文<textarea class="input" rows="12" v-model="form.body" maxlength="20000" /></label>
      <template #footer><AdminButton :disabled="busy" @click="save(false)">保存草稿</AdminButton><AdminButton variant="primary" :disabled="busy" @click="save(true)">发布到问答</AdminButton></template>
    </DrawerPanel>
  </FlowPage>
</template>

<style scoped>
.knowledge-panel { gap: 0; }
.knowledge-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 6px 16px; }
.knowledge-toolbar label { grid-column: 1 / -1; font-weight: 600; }
.knowledge-toolbar .input { min-width: 0; }
.knowledge-hint { margin: 12px 0 16px; }
.knowledge-list { min-height: 0; overflow: auto; scrollbar-gutter: stable; }
.knowledge-row { display: flex; justify-content: space-between; gap: 20px; padding: 16px 2px; border-top: 1px solid var(--admin-line, #d8e4dc); }
.knowledge-row__content { min-width: 0; flex: 1; }
.knowledge-row__heading { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.knowledge-row__heading h2 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
.knowledge-row__meta { margin: 6px 0; }
.knowledge-row__excerpt { margin: 0; max-width: 72ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.knowledge-row__actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; align-self: center; flex-shrink: 0; }
.knowledge-status { border-radius: 999px; padding: 3px 9px; background: #f4ead7; color: #785319; font-size: .75rem; white-space: nowrap; }
.knowledge-status--published { background: #e1f0e7; color: #20583d; }
.knowledge-status--disabled { background: #e5e8e7; color: #4e5d58; }
.knowledge-pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 12px; border-top: 1px solid var(--admin-line, #d8e4dc); }
.knowledge-pagination .btn-group { margin: 0; }
.knowledge-field { display: grid; gap: 8px; margin: 16px 0; }
@media (max-width: 720px) { .knowledge-row { display: block; } .knowledge-row__actions { margin-top: 12px; } .knowledge-toolbar { grid-template-columns: minmax(0, 1fr); } .knowledge-toolbar label { grid-column: auto; } }
</style>
