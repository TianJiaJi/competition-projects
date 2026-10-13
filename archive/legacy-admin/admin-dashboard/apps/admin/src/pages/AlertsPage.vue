<script setup lang="ts">
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>load());
import { LiquidGlassButton } from "@scenic/ui/liquid-glass";
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import { cachedFilters } from "../app/filter-cache";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { regions } from "@scenic/scenic";
import { alertStatusTone, severityTone } from "../app/format";
import type { AlertDetail, AlertView } from "../services/alerts";
import { alertStatusLabels, categoryLabels, getAlert, listAlerts, severityLabels, type AlertQuery } from "../services/alerts";
import type { ListResult } from "../services/list";
import { toDateString, businessNow } from "../core/time";
import { useRoute } from "../router";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
import FlowFilters from "../components/FlowFilters.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import Pagination from "../components/Pagination.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const route = useRoute();
const today = toDateString(businessNow());
const scope = ref<"current" | "history">((route.value.params["query.scope"] as "current" | "history") ?? "current");
const filters = cachedFilters("alerts", { severity: "all", category: "all", status: "all", regionId: "all", from: "", to: "", keyword: "", page: 1, pageSize: 20 });
const result = ref<ListResult<AlertView> | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const detail = ref<AlertDetail | null>(null);
const detailOpen = ref(false);

const statusOptions = computed(() => [
  { value: "all", label: "全部状态" },
  ...(scope.value === "history"
    ? [{ value: "resolved", label: alertStatusLabels.resolved }]
    : [
        { value: "pending", label: alertStatusLabels.pending },
        { value: "processing", label: alertStatusLabels.processing },
      ]),
]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
  const response = await listAlerts({
    scope: scope.value,
    severity: filters.severity as AlertQuery["severity"],
    category: filters.category as AlertQuery["category"],
    status: filters.status as AlertQuery["status"],
    regionId: filters.regionId,
    from: filters.from || undefined,
    to: filters.to || undefined,
    keyword: filters.keyword,
    page: filters.page,
    pageSize: filters.pageSize,
  });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  result.value = response.data;
  } catch { error.value = "读取失败，请重试。"; }
  finally { loading.value = false; }
}

async function switchScope(next: "current" | "history"): Promise<void> {
  scope.value = next;
  filters.status = "all";
  filters.page = 1;
  window.location.hash = `#/alerts?scope=${next}`;
  await load();
}

async function search(): Promise<void> {
  filters.page = 1;
  await load();
}

async function openDetail(id: string): Promise<void> {
  const response = await getAlert(id);
  if (!response.ok) return;
  detail.value = response.data;
  detailOpen.value = true;
}

onMounted(load);

/** 同一路径下的 scope 参数变化（如工作台“未完成告警”入口）也要切换页签。 */
watch(
  () => route.value.params["query.scope"],
  (next) => {
    if (!next || next === scope.value) return;
    if (next !== "current" && next !== "history") return;
    void switchScope(next);
  },
);
</script>

<template>
  <FlowPage>
    <PageHeader
      title="告警记录"

    />

    <div class="tabs" role="tablist" aria-label="告警范围">
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="scope === 'current'" @click="switchScope('current')">当前告警</LiquidGlassButton>
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="scope === 'history'" @click="switchScope('history')">历史告警</LiquidGlassButton>
    </div>

    <FlowFilters :model="filters" :primary="['alert-keyword', 'alert-severity', 'alert-status']" search="alert-keyword"
      :busy="loading"
      @submit="search"
      @reset="() => { filters.severity = 'all'; filters.category = 'all'; filters.status = 'all'; filters.regionId = 'all'; filters.from = ''; filters.to = ''; filters.keyword = ''; filters.page = 1; load(); }"
    ><template #default="{ filter }">
      <FormField label="级别" field="alert-severity">
        <SelectInput
          id="alert-severity"
          v-model="filter.severity"
          :options="[
            { value: 'all', label: '全部级别' },
            { value: 'reminder', label: '提醒' },
            { value: 'important', label: '重要' },
            { value: 'critical', label: '紧急' },
          ]"
        />
      </FormField>
      <FormField label="类别" field="alert-category">
        <SelectInput
          id="alert-category"
          v-model="filter.category"
          :options="[{ value: 'all', label: '全部类别' }, ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))]"
        />
      </FormField>
      <FormField label="处理状态" field="alert-status">
        <SelectInput id="alert-status" v-model="filter.status" :options="statusOptions" />
      </FormField>
      <FormField label="区域" field="alert-region">
        <SelectInput
          id="alert-region"
          v-model="filter.regionId"
          :options="[{ value: 'all', label: '全部区域' }, ...regions.map((region) => ({ value: region.id, label: `${region.id} · ${region.name}` }))]"
        />
      </FormField>
      <FormField label="发生日期（起）" field="alert-from">
        <input id="alert-from" v-model="filter.from" class="input" type="date" :max="today" />
      </FormField>
      <FormField label="发生日期（止）" field="alert-to">
        <input id="alert-to" v-model="filter.to" class="input" type="date" :max="today" />
      </FormField>
      <FormField label="关键词" field="alert-keyword">
        <TextInput id="alert-keyword" v-model="filter.keyword" placeholder="标题、原因或位置" />
      </FormField>
    </template></FlowFilters>

    <FlowPanel>
      <AsyncSection :retain="Boolean(result)" :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'title', label: '标题' },
            { key: 'severity', label: '级别' },
            { key: 'location', label: '位置' },
            { key: 'status', label: '处理状态' },
            { key: 'startedText', label: scope === 'history' ? '发生 / 完成时间' : '发生时间' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          :caption="scope === 'history' ? '历史按完成时间倒序，相同时间按 ID 排序' : '当前按紧急 → 重要 → 提醒，同级按发生时间倒序'"
          empty-text="当前筛选下没有告警记录。"
        >
          <template #cell-title="{ row }">
            <span class="stack" style="gap: 2px">
              <span>{{ row.title }}</span>
              <span class="muted small">{{ categoryLabels[row.category as never] }}</span>
            </span>
          </template>
          <template #cell-severity="{ row }">
            <StatusTag :label="severityLabels[row.severity as never]" :tone="severityTone(row.severity as never)" />
          </template>
          <template #cell-category="{ row }">
            {{ categoryLabels[row.category as never] }}
          </template>
          <template #cell-status="{ row }">
            <StatusTag :label="alertStatusLabels[row.status as never]" :tone="alertStatusTone(row.status as never)" />
          </template>
          <template #cell-startedText="{ row }">
            <span class="num small">
              {{ row.startedText }}
              <template v-if="scope === 'history' && row.completedText"><br />{{ row.completedText }}</template>
            </span>
          </template>
          <template #cell-actions="{ row }">
            <AdminButton size="sm" @click="openDetail(String(row.id))">只读详情</AdminButton>
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
    </FlowPanel>

    <DrawerPanel v-if="detailOpen && detail" :title="detail.alert.title" subtitle="只读详情（无处置按钮）" @close="detailOpen = false">
      <div class="definition-list">
        <span class="muted">级别</span>
        <span><StatusTag :label="severityLabels[detail.alert.severity]" :tone="severityTone(detail.alert.severity)" /></span>
        <span class="muted">类别</span>
        <span>{{ categoryLabels[detail.alert.category] }}</span>
        <span class="muted">位置</span>
        <span>{{ detail.alert.location }}{{ detail.facilityName ? `（关联设施：${detail.facilityName}）` : "" }}</span>
        <span class="muted">处理状态</span>
        <span><StatusTag :label="alertStatusLabels[detail.alert.status]" :tone="alertStatusTone(detail.alert.status)" /></span>
        <span class="muted">原因</span>
        <span>{{ detail.alert.reason }}</span>
        <span class="muted">监测依据</span>
        <span>{{ detail.alert.metric }}</span>
        <span class="muted">发生时间</span>
        <span class="num">{{ detail.alert.startedText }}</span>
        <span v-if="detail.alert.previousAlertId" class="muted">上一事件</span>
        <span v-if="detail.alert.previousAlertId" class="num">{{ detail.alert.previousAlertId }}（恢复后再次告警，独立事件）</span>
      </div>

      <div>
        <p class="section-title">处理时间线</p>
        <AsyncSection :empty="!detail.timeline.length" empty-text="没有处理记录，不伪造处理人与完成时间。">
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px">
            <li v-for="record in detail.timeline" :key="`${record.at}-${record.kind}`" class="stack" style="gap: 2px">
              <span class="num small">{{ record.atText }} · {{ record.actor }}</span>
              <span>{{ record.text }}</span>
            </li>
          </ul>
        </AsyncSection>
      </div>

      <p class="muted small" style="margin: 0">
        后台无需三维定位，显示区域与点位名称即可；本页没有派单、开始处置或完成按钮。
      </p>

      <template #footer>
        <AdminButton @click="detailOpen = false">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </FlowPage>
</template>
