<script setup lang="ts">
import { cachedFilters } from "../app/filter-cache";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { askConfirm, pushToast, registerUnsavedGuard } from "../app/state";
import { dateTimeText, noticeTone } from "../app/format";
import type { FieldError } from "../core/result";
import { addDays, businessNow, parseWallClock, toDateString, toWallClockValue } from "../core/time";
import { LIMITS } from "../core/validate";
import type { Notice } from "../core/types";
import {
  adminListNotices,
  createNotice,
  deleteNotice,
  saveNotice,
  type NoticeInput,
  type NoticeQuery,
  type NoticeView,
} from "../services/content";
import type { ListResult } from "../services/list";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
import FilterBar from "../components/FilterBar.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import Pagination from "../components/Pagination.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const filters = cachedFilters("notices", { keyword: "", audience: "all", published: "all", effectiveState: "all", page: 1, pageSize: 20 });
const result = ref<ListResult<NoticeView> | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const drawerOpen = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const busyId = ref<string | null>(null);

const today = toDateString(businessNow());

function emptyForm(): NoticeInput {
  return {
    title: "",
    body: "",
    audience: "public",
    startsAt: `${today}T15:00`,
    endsAt: `${today}T16:00`,
  };
}

const form = ref<NoticeInput>(emptyForm());
const formSaved = ref<string>(JSON.stringify(emptyForm()));
const dirty = computed(() => JSON.stringify(form.value) !== formSaved.value);

let removeGuard: (() => void) | null = null;

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await adminListNotices({
    keyword: filters.keyword,
    audience: filters.audience as NoticeQuery["audience"],
    published: filters.published === "all" ? "all" : filters.published === "published",
    effectiveState: filters.effectiveState as NoticeQuery["effectiveState"],
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
  filters.audience = "all";
  filters.published = "all";
  filters.effectiveState = "all";
  filters.page = 1;
  await load();
}

function openCreate(): void {
  editingId.value = null;
  const next = emptyForm();
  form.value = next;
  formSaved.value = JSON.stringify(next);
  formError.value = null;
  fieldErrors.value = [];
  drawerOpen.value = true;
}

function openEdit(notice: NoticeView): void {
  editingId.value = notice.id;
  const next: NoticeInput = {
    title: notice.title,
    body: notice.body,
    audience: notice.audience,
    startsAt: toWallClockValue(Date.parse(notice.startsAt)),
    endsAt: toWallClockValue(Date.parse(notice.endsAt)),
  };
  form.value = next;
  formSaved.value = JSON.stringify(next);
  formError.value = null;
  fieldErrors.value = [];
  drawerOpen.value = true;
}

async function closeDrawer(): Promise<void> {
  if (dirty.value) {
    const confirmed = await askConfirm({
      title: "有未保存的公告草稿",
      message: "关闭抽屉将放弃当前草稿。",
      confirmText: "放弃草稿",
      danger: true,
    });
    if (!confirmed) return;
  }
  drawerOpen.value = false;
}

async function submit(publish: boolean): Promise<void> {
  if (saving.value) return;
  if (publish) {
    const start = parseWallClock(form.value.startsAt);
    const end = parseWallClock(form.value.endsAt);
    const confirmed = await askConfirm({
      title: "发布公告",
      message: `将发布《${form.value.title || "（未填写标题）"}》。`,
      details: [
        `目标范围：${form.value.audience === "public" ? "公开（游客与工作人员可见）" : "内部（仅工作人员视图可见）"}`,
        `有效时间：${start !== null ? dateTimeText(start) : "未填写"} — ${end !== null ? dateTimeText(end) : "未填写"}`,
        "发布后按业务时间自动呈现未发布／待生效／生效中／已过期",
      ],
      confirmText: "发布",
    });
    if (!confirmed) return;
  }
  saving.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const payload: NoticeInput = { ...form.value };
  const response = editingId.value
    ? await saveNotice(editingId.value, { ...payload, published: publish ? true : undefined })
    : await createNotice({ ...payload, published: publish });
  saving.value = false;
  if (!response.ok) {
    formError.value = response.error.code === "VALIDATION_ERROR" ? "公告校验未通过，请检查标红字段。" : response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  formSaved.value = JSON.stringify(form.value);
  pushToast("success", publish ? "公告已发布（生效状态按业务时间计算）。" : "公告已保存为未发布草稿。");
  drawerOpen.value = false;
  await load();
}

async function togglePublished(notice: NoticeView): Promise<void> {
  const next = !notice.published;
  const confirmed = await askConfirm({
    title: next ? "发布公告" : "下架公告",
    message: `${next ? "发布" : "下架"}《${notice.title}》。`,
    details: [
      `目标范围：${notice.audience === "public" ? "公开（游客与工作人员可见）" : "内部（仅工作人员视图可见）"}`,
      `有效时间：${dateTimeText(Date.parse(notice.startsAt))} — ${dateTimeText(Date.parse(notice.endsAt))}`,
    ],
    confirmText: next ? "发布" : "下架",
  });
  if (!confirmed) return;
  busyId.value = notice.id;
  const response = await saveNotice(notice.id, {
    title: notice.title,
    body: notice.body,
    audience: notice.audience,
    startsAt: toWallClockValue(Date.parse(notice.startsAt)),
    endsAt: toWallClockValue(Date.parse(notice.endsAt)),
    published: next,
  });
  busyId.value = null;
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", next ? "公告已发布。" : "公告已下架。");
  await load();
}

async function remove(notice: NoticeView): Promise<void> {
  const confirmed = await askConfirm({
    title: "删除公告",
    message: `将删除《${notice.title}》（${notice.id}）。`,
    details: ["删除后该公告不再出现在列表中，操作不会自动生成告警。"],
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) return;
  busyId.value = notice.id;
  const response = await deleteNotice(notice.id);
  busyId.value = null;
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", "公告已删除。");
  await load();
}

const previewState = computed(() => {
  const start = parseWallClock(form.value.startsAt);
  const end = parseWallClock(form.value.endsAt);
  if (start === null || end === null) return "时间未填写完整";
  if (start >= end) return "开始时间必须严格早于结束时间";
  const now = businessNow();
  if (!start || !end) return "时间无效";
  if (now < start) return "待生效（未发布时为未发布）";
  if (now < end) return "生效中（区间左闭右开）";
  return "已过期";
});

onMounted(() => {
  void load();
  removeGuard = registerUnsavedGuard(() => (drawerOpen.value && dirty.value ? "公告抽屉中有未保存的草稿。" : null));
});

onBeforeUnmount(() => removeGuard?.());

const tomorrow = addDays(today, 1);
</script>

<template>
  <section class="stack">
    <PageHeader title="公告管理" description="区间按上海业务时间左闭右开计算；内部公告只在工作人员视图可见。">
      <template #actions>
        <AdminButton variant="primary" @click="openCreate">新增公告</AdminButton>
      </template>
    </PageHeader>

    <FilterBar :busy="loading" @submit="search" @reset="reset">
      <FormField label="关键词" field="notice-keyword">
        <TextInput id="notice-keyword" v-model="filters.keyword" placeholder="匹配标题与正文" />
      </FormField>
      <FormField label="范围" field="notice-audience">
        <SelectInput
          id="notice-audience"
          v-model="filters.audience"
          :options="[
            { value: 'all', label: '全部范围' },
            { value: 'public', label: '公开' },
            { value: 'internal', label: '内部' },
          ]"
        />
      </FormField>
      <FormField label="发布状态" field="notice-published">
        <SelectInput
          id="notice-published"
          v-model="filters.published"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'published', label: '已发布' },
            { value: 'draft', label: '未发布' },
          ]"
        />
      </FormField>
      <FormField label="生效状态" field="notice-state">
        <SelectInput
          id="notice-state"
          v-model="filters.effectiveState"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'unpublished', label: '未发布' },
            { value: 'pending', label: '待生效' },
            { value: 'active', label: '生效中' },
            { value: 'expired', label: '已过期' },
          ]"
        />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'title', label: '标题' },
            { key: 'audience', label: '范围' },
            { key: 'published', label: '是否发布' },
            { key: 'effectiveState', label: '实际生效' },
            { key: 'period', label: '开始 / 结束' },
            { key: 'updatedAt', label: '更新时间' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          empty-text="没有符合条件的公告。"
        >
          <template #cell-title="{ row }">
            <span class="stack" style="gap: 2px">
              <span>{{ row.title }}</span>
              <span class="muted small">{{ String(row.body).slice(0, 40) }}</span>
            </span>
          </template>
          <template #cell-audience="{ row }">
            <StatusTag
              :label="row.audience === 'public' ? '公开（游客可见）' : '内部（仅工作人员）'"
              :tone="row.audience === 'public' ? 'info' : 'warning'"
            />
          </template>
          <template #cell-published="{ row }">
            <StatusTag :label="row.published ? '已发布' : '未发布'" :tone="row.published ? 'success' : 'neutral'" />
          </template>
          <template #cell-effectiveState="{ row }">
            <StatusTag
              :label="String(row.effectiveState === 'unpublished' ? '未发布' : row.effectiveState === 'pending' ? '待生效' : row.effectiveState === 'active' ? '生效中' : '已过期')"
              :tone="noticeTone(row.effectiveState as never)"
            />
          </template>
          <template #cell-period="{ row }">
            <span class="num small">{{ dateTimeText(Date.parse(String(row.startsAt))) }}<br />{{ dateTimeText(Date.parse(String(row.endsAt))) }}</span>
          </template>
          <template #cell-updatedAt="{ row }">
            <span class="num">{{ dateTimeText(Number(row.updatedAt)) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <span class="btn-group">
              <AdminButton size="sm" @click="openEdit(row as unknown as NoticeView)">编辑</AdminButton>
              <AdminButton size="sm" :loading="busyId === row.id" @click="togglePublished(row as unknown as NoticeView)">
                {{ row.published ? "下架" : "发布" }}
              </AdminButton>
              <AdminButton size="sm" variant="danger" :loading="busyId === row.id" @click="remove(row as unknown as NoticeView)">
                删除
              </AdminButton>
            </span>
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

    <DrawerPanel
      v-if="drawerOpen"
      :title="editingId ? '编辑公告' : '新增公告'"
      subtitle="保存默认为未发布；发布动作与保存分开"
      @close="closeDrawer"
    >
      <form class="form-stack" @submit.prevent="submit(false)">
        <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>

        <FormField label="标题" field="title" required :errors="fieldErrors" :hint="`1—${LIMITS.title.max} 字`">
          <template #default="{ invalid }">
            <TextInput id="title" v-model="form.title" :invalid="invalid" :maxlength="LIMITS.title.max" />
          </template>
        </FormField>

        <FormField label="正文（纯文本）" field="body" required :errors="fieldErrors" :hint="`1—${LIMITS.noticeBody.max} 字`">
          <template #default="{ invalid }">
            <TextInput id="body" v-model="form.body" textarea :rows="5" :invalid="invalid" :maxlength="LIMITS.noticeBody.max" />
          </template>
        </FormField>

        <FormField label="范围" field="audience" required :errors="fieldErrors" hint="内部公告只在工作人员视图可见">
          <template #default="{ invalid }">
            <SelectInput
              id="audience"
              v-model="form.audience"
              :invalid="invalid"
              :options="[
                { value: 'public', label: '公开（public）' },
                { value: 'internal', label: '内部（internal）' },
              ]"
            />
          </template>
        </FormField>

        <div class="form-grid">
          <FormField label="开始时间" field="startsAt" required :errors="fieldErrors" hint="上海业务时间">
            <template #default="{ invalid }">
              <input id="startsAt" v-model="form.startsAt" class="input" type="datetime-local" :aria-invalid="invalid || undefined" />
            </template>
          </FormField>
          <FormField label="结束时间" field="endsAt" required :errors="fieldErrors" hint="必须晚于开始时间">
            <template #default="{ invalid }">
              <input id="endsAt" v-model="form.endsAt" class="input" type="datetime-local" :aria-invalid="invalid || undefined" />
            </template>
          </FormField>
        </div>

        <div class="panel" style="background: #f7fbf9">
          <p class="section-title">预览与目标范围</p>
          <p class="inline-note">
            当前业务时间 {{ dateTimeText(businessNow()) }} 下的状态：<strong>{{ previewState }}</strong>
          </p>
          <p class="inline-note">
            目标范围：{{ form.audience === "public" ? "公开，游客端与工作人员视图可见（本期仅本后台可复查）" : "内部，仅工作人员视图可见" }}
          </p>
          <p class="muted small" style="margin: 6px 0 0">
            允许创建过去区间的样例；发布过期公告仍显示“已过期”，不提示正在展示。
          </p>
        </div>
      </form>

      <template #footer>
        <AdminButton :loading="saving" @click="submit(false)">保存草稿</AdminButton>
        <AdminButton variant="primary" :loading="saving" @click="submit(true)">发布</AdminButton>
        <AdminButton @click="closeDrawer">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
