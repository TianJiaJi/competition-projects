<script setup lang="ts">
import { cachedFilters } from "../app/filter-cache";
import { computed, onMounted, reactive, ref } from "vue";
import { regions } from "@scenic/scenic";
import { facilityTone, dateTimeText } from "../app/format";
import { askConfirm, pushToast } from "../app/state";
import type { FieldError } from "../core/result";
import type { FacilityDetail, FacilityView } from "../services/facilities";
import {
  facilityStateLabel,
  getFacility,
  listFacilities,
  saveRestroomAdjustment,
  updateFacilityState,
  type FacilityQuery,
} from "../services/facilities";
import { RESTROOM_PART_KEYS, RESTROOM_PART_LABELS, facilityCategoryLabels, type FacilityState, type RestroomPartKey } from "../core/types";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
import FilterBar from "../components/FilterBar.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const filters = cachedFilters("facilities", { category: "all", regionId: "all", state: "all", keyword: "" });
const rows = ref<FacilityView[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const detail = ref<FacilityDetail | null>(null);
const detailOpen = ref(false);
const targetState = ref<FacilityState>("open");
const reason = ref("");
const busy = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const savedNotice = ref<string | null>(null);
const formDetails = ref<string[]>([]);
const requested = reactive<Record<RestroomPartKey, string>>({ female: "0", male: "0", maleUrinals: "0", accessible: "0" });

const categoryOptions = [
  { value: "all", label: "全部类别" },
  ...Object.entries(facilityCategoryLabels).map(([value, label]) => ({ value, label })),
];
const regionOptions = [{ value: "all", label: "全部区域" }, ...regions.map((region) => ({ value: region.id, label: `${region.id} · ${region.name}` }))];

const stateOptions = computed(() => {
  const mode = detail.value?.facility.stateMode ?? "full";
  if (mode === "road") {
    return [
      { value: "open", label: "开放" },
      { value: "closed", label: "关闭" },
    ];
  }
  return [
    { value: "open", label: "开放" },
    { value: "maintenance", label: "维护" },
    { value: "closed", label: "停用" },
  ];
});

const restroomSavable = computed(() => {
  if (!detail.value?.restroom) return false;
  return !detail.value.restroom.dataIssue;
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await listFacilities({
    category: filters.category as FacilityQuery["category"],
    regionId: filters.regionId,
    state: filters.state as FacilityState | "all",
    keyword: filters.keyword,
  });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  rows.value = response.data;
}

async function openDetail(id: string): Promise<void> {
  const response = await getFacility(id);
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  detail.value = response.data;
  targetState.value = response.data.facility.state;
  reason.value = response.data.facility.stateReason ?? "";
  formError.value = null;
  fieldErrors.value = [];
  formDetails.value = [];
  savedNotice.value = null;
  if (response.data.restroom) {
    for (const key of RESTROOM_PART_KEYS) requested[key] = String(response.data.restroom.requested[key] ?? 0);
  }
  detailOpen.value = true;
}

async function submitState(): Promise<void> {
  if (!detail.value || busy.value) return;
  const facility = detail.value.facility;
  const nextLabel = facilityStateLabel(targetState.value);
  const confirmed = await askConfirm({
    title: "变更设施状态",
    message: `将把「${facility.name}」（${facility.id}）从「${facilityStateLabel(facility.state)}」改为「${nextLabel}」。`,
    details: [
      facility.category === "cable" ? "索道操作同时作用上下站，排队与在途人数保留" : `影响范围：${facility.regionName}`,
      targetState.value === "open" ? "恢复开放不会自动归档已有告警" : `原因：${reason.value.trim() || "（未填写）"}`,
      ...facility.impact,
    ],
    confirmText: "确认变更",
    danger: targetState.value !== "open",
  });
  if (!confirmed) return;
  busy.value = true;
  formError.value = null;
  fieldErrors.value = [];
  formDetails.value = [];
  const response = await updateFacilityState(detail.value.facility.id, { state: targetState.value, reason: reason.value });
  busy.value = false;
  if (!response.ok) {
    formError.value = response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    formDetails.value = response.error.details ?? [];
    return;
  }
  pushToast("success", `已更新为${facilityStateLabel(response.data.state)}。`);
  await openDetail(detail.value.facility.id);
  await load();
}

async function submitRestroom(): Promise<void> {
  if (!detail.value || busy.value) return;
  busy.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const payload: Record<RestroomPartKey, number> = {
    female: Number(requested.female),
    male: Number(requested.male),
    maleUrinals: Number(requested.maleUrinals),
    accessible: Number(requested.accessible),
  };
  const response = await saveRestroomAdjustment(detail.value.facility.id, {
    state: targetState.value as "open" | "maintenance" | "closed",
    reason: reason.value,
    requested: payload,
  });
  busy.value = false;
  if (!response.ok) {
    formError.value = response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  pushToast("success", "卫生间分项调整已保存。");
  await openDetail(detail.value.facility.id);
  await load();
}

onMounted(load);
</script>

<template>
  <section class="stack">
    <PageHeader
      title="设施运行"
      description="全类别设施的可用状态；道路只允许开放／关闭，卫生间使用分项暂停抽屉，索道按整线控制。"
    />

    <FilterBar
      :busy="loading"
      @submit="load"
      @reset="() => { filters.category = 'all'; filters.regionId = 'all'; filters.state = 'all'; filters.keyword = ''; load(); }"
    >
      <FormField label="类别" field="facility-category">
        <SelectInput id="facility-category" v-model="filters.category" :options="categoryOptions" />
      </FormField>
      <FormField label="区域" field="facility-region">
        <SelectInput id="facility-region" v-model="filters.regionId" :options="regionOptions" />
      </FormField>
      <FormField label="状态" field="facility-state">
        <SelectInput
          id="facility-state"
          v-model="filters.state"
          :options="[
            { value: 'all', label: '全部状态' },
            { value: 'open', label: '开放中' },
            { value: 'maintenance', label: '维护中' },
            { value: 'closed', label: '已停用' },
            { value: 'unknown', label: '状态未知（只读）' },
          ]"
        />
      </FormField>
      <FormField label="关键词" field="facility-keyword">
        <TextInput id="facility-keyword" v-model="filters.keyword" placeholder="名称或 ID" />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'name', label: '名称' },
            { key: 'category', label: '类别' },
            { key: 'regionName', label: '区域' },
            { key: 'state', label: '当前运行状态' },
            { key: 'stateReason', label: '原因' },
            { key: 'stateUpdatedAt', label: '更新时间' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="rows as unknown as Array<Record<string, unknown>>"
          :row-key="(row) => String(row.id)"
          empty-text="没有符合条件的设施。"
        >
          <template #cell-name="{ row }">
            <span class="stack" style="gap: 2px">
              <span>{{ row.name }}</span>
              <span class="muted small">{{ row.id }}</span>
            </span>
          </template>
          <template #cell-category="{ row }">
            <StatusTag :label="facilityCategoryLabels[row.category as never]" tone="info" />
          </template>
          <template #cell-state="{ row }">
            <StatusTag :label="facilityStateLabel(row.state as FacilityState)" :tone="facilityTone(row.state as FacilityState)" />
          </template>
          <template #cell-stateReason="{ row }">
            <span class="muted small">{{ row.stateReason ?? "—" }}</span>
          </template>
          <template #cell-stateUpdatedAt="{ row }">
            <span class="num small">{{ dateTimeText(Number(row.stateUpdatedAt)) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <AdminButton size="sm" @click="openDetail(String(row.id))">详情</AdminButton>
          </template>
        </DataTable>
      </AsyncSection>
    </div>

    <DrawerPanel
      v-if="detailOpen && detail"
      :wide="detail.facility.category === 'toilet'"
      :title="detail.facility.name"
      :subtitle="`${facilityCategoryLabels[detail.facility.category]} · ${detail.facility.regionName}`"
      @close="detailOpen = false"
    >
      <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>
      <ul v-if="formDetails.length" class="impact-list" aria-label="受影响的位置">
        <li v-for="detail in formDetails" :key="detail">受影响：{{ detail }}</li>
      </ul>
      <p v-if="savedNotice" class="inline-note">{{ savedNotice }}</p>

      <div class="definition-list">
        <span class="muted">设施 ID</span>
        <span class="num">{{ detail.facility.id }}（共享值）</span>
        <span class="muted">当前状态</span>
        <span><StatusTag :label="facilityStateLabel(detail.facility.state)" :tone="facilityTone(detail.facility.state)" /></span>
        <template v-for="metric in detail.facility.metrics" :key="metric.label">
          <span class="muted">{{ metric.label }}</span>
          <span>{{ metric.value }}</span>
        </template>
      </div>

      <div v-if="detail.facility.stateMode !== 'restroom'" class="panel stack">
        <p class="section-title">状态变更</p>
        <p v-if="detail.facility.id === 'gate-out'" class="inline-note">
          <span class="tag tag--warning">不可停用</span> 景区出口 gate-out 是唯一配置出口。
        </p>
        <FormField label="目标状态" field="targetState" required :errors="fieldErrors">
          <template #default="{ invalid }">
            <SelectInput id="targetState" v-model="targetState" :invalid="invalid" :options="stateOptions" />
          </template>
        </FormField>
        <FormField
          label="原因"
          field="reason"
          :errors="fieldErrors"
          hint="停用或维护时必填，1—200 字"
        >
          <template #default="{ invalid }">
            <TextInput id="reason" v-model="reason" textarea :rows="3" :invalid="invalid" :maxlength="200" />
          </template>
        </FormField>
        <div class="btn-group">
          <AdminButton variant="primary" :loading="busy" @click="submitState">保存状态</AdminButton>
        </div>
        <p class="muted small" style="margin: 0">
          运行状态变更不得借机编辑名称、营业时间、容量、路网或设备参数；恢复开放不会自动归档告警。
        </p>
        <div v-if="detail.pathCheck" class="stack">
          <p class="section-title">返程通路校验（步行）</p>
          <p class="inline-note">
            现状检查：{{ detail.pathCheck.ok ? "全部检查起点均可步行到达出口" : "存在不可达节点，详见下方" }}
          </p>
          <ul v-if="detail.pathCheck.existing.length" class="impact-list">
            <li v-for="item in detail.pathCheck.existing" :key="item.id">现状已不可达：{{ item.label }}</li>
          </ul>
          <p class="muted small" style="margin: 0">
            该检查是 Mock 业务规则，不声称完成真实消防或疏散验证；出口要求以步行通路为准，不依赖索道撤离。
          </p>
        </div>
      </div>

      <div v-if="detail.facility.category === 'toilet' && detail.restroom" class="stack">
        <div class="panel stack">
          <p class="section-title">整座状态与原因</p>
          <FormField label="整座状态" field="restroomState" required :errors="fieldErrors">
            <template #default="{ invalid }">
              <SelectInput
                id="restroomState"
                v-model="targetState"
                :invalid="invalid"
                :options="[
                  { value: 'open', label: '开放' },
                  { value: 'maintenance', label: '维护' },
                  { value: 'closed', label: '关闭' },
                ]"
              />
            </template>
          </FormField>
          <FormField label="原因" field="reason" :errors="fieldErrors" hint="维护或关闭时必填">
            <template #default="{ invalid }">
              <TextInput id="reason" v-model="reason" textarea :rows="2" :invalid="invalid" :maxlength="200" />
            </template>
          </FormField>
        </div>

        <p v-if="detail.restroom.dataIssue" class="form-error-banner" role="alert">
          样例数据异常，禁止分项保存：{{ detail.restroom.dataIssue }}
        </p>

        <div class="table-scroll">
          <table class="data-table compare-table data-table--dense">
            <caption>
              每分项维护总数 N、使用中 O、排队 Q、基础暂停 B、人工申请 R、实际暂停 S、等待释放 W、可用 A；满足 N = O + A + S
            </caption>
            <thead>
              <tr>
                <th scope="col">分项</th>
                <th scope="col">N</th>
                <th scope="col">O</th>
                <th scope="col">Q</th>
                <th scope="col">B</th>
                <th scope="col">R（可编辑）</th>
                <th scope="col">S</th>
                <th scope="col">W</th>
                <th scope="col">A</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="part in detail.restroom.parts" :key="part.key">
                <th scope="row">{{ RESTROOM_PART_LABELS[part.key] }}</th>
                <td class="num">{{ part.total }}</td>
                <td class="num">{{ part.occupied }}</td>
                <td class="num">{{ part.queue }}</td>
                <td class="num">{{ part.baselinePaused }}</td>
                <td>
                  <input
                    v-model="requested[part.key]"
                    class="input"
                    type="number"
                    min="0"
                    step="1"
                    :disabled="!restroomSavable"
                    :aria-label="`${RESTROOM_PART_LABELS[part.key]}人工申请暂停数量`"
                    style="min-height: 32px"
                  />
                </td>
                <td class="num">{{ part.effectivePaused }}</td>
                <td class="num">{{ part.pendingRelease }}</td>
                <td class="num">{{ part.available }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <dl class="definition-list">
          <dt>整座合计</dt>
          <dd class="num">
            N {{ detail.restroom.totals.total }} · O {{ detail.restroom.totals.occupied }} · S {{ detail.restroom.totals.effectivePaused }} ·
            W {{ detail.restroom.totals.pendingRelease }} · A {{ detail.restroom.totals.available }} · Q {{ detail.restroom.totals.queue }}
          </dd>
        </dl>

        <div class="btn-group">
          <AdminButton variant="primary" :loading="busy" :disabled="!restroomSavable" :disabled-reason="'样例数据异常，禁止分项保存'" @click="submitRestroom">
            保存分项调整
          </AdminButton>
        </div>
        <p class="muted small" style="margin: 0">
          人工申请为该分项希望达到的暂停总数，不与基础暂停相加；申请超过物理余量时，超出部分计入“等待释放”，界面说明“等待后续使用数据更新后生效”。
          原型不模拟占用释放，原始 Q&gt;0 时可用位保持 0，也不会清空排队。
        </p>
      </div>

      <div class="panel stack">
        <p class="section-title">关联业务</p>
        <AsyncSection :empty="!detail.relatedAlerts.length" empty-text="该设施当前没有关联告警。">
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px">
            <li v-for="alert in detail.relatedAlerts" :key="alert.id" class="row" style="justify-content: space-between">
              <span>{{ alert.title }}</span>
              <StatusTag :label="`${alert.severity} · ${alert.status}`" tone="warning" />
            </li>
          </ul>
        </AsyncSection>
        <AsyncSection :empty="!detail.plans.length" empty-text="该设施没有检修计划。">
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px">
            <li v-for="plan in detail.plans" :key="plan.id" class="row" style="justify-content: space-between">
              <span class="num small">{{ plan.id }} · 每 {{ plan.intervalDays }} 天 · 下次 {{ plan.nextDueDate }}</span>
              <StatusTag :label="plan.enabled ? '启用中' : '已停用'" :tone="plan.enabled ? 'success' : 'neutral'" />
            </li>
          </ul>
        </AsyncSection>
        <p v-if="detail.facility.impact.length" class="muted small" style="margin: 0">影响与边界：{{ detail.facility.impact.join("；") }}</p>
      </div>

      <template #footer>
        <AdminButton @click="detailOpen = false">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
