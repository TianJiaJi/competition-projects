<script setup lang="ts">
import ScheduleEditor from "../components/ScheduleEditor.vue";
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>load());
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import { useDraftGuard } from "../app/use-draft-guard";
import { computed, onMounted, ref, watch } from "vue";
import { cachedFilters } from "../app/filter-cache";
import { parkingZones } from "@scenic/scenic";
import { pushToast } from "../app/state";
import { addDays, businessNow, toDateString } from "../core/time";
import { LIMITS, checkText, collectErrors } from "../core/validate";
import type { FieldError } from "../core/result";
import type { SlotView } from "../core/types";
import { adminListSlots, saveSlotCapacity } from "../services/orders";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import FlowFilters from "../components/FlowFilters.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";

const today = toDateString(businessNow());
const filters = cachedFilters("slots", { date: today, type: "admission", lotId: "all" });
const rows = ref<SlotView[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const editing = ref<SlotView | null>(null);
const quotaInput = ref("0");
const saving = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);

const discardDraft = useDraftGuard(() => Boolean(editing.value && quotaInput.value !== String(editing.value.interactiveQuota)), "配额调整尚未保存。", () => saving.value);
async function closeAdjust(): Promise<void> {
  if (await discardDraft()) editing.value = null;
}

const dateOptions = [
  { value: today, label: `${today}（当天）` },
  { value: addDays(today, 1), label: `${addDays(today, 1)}（次日）` },
];
const lotOptions = [
  { value: "all", label: "全部停车场" },
  ...parkingZones.map((zone) => ({ value: zone.id, label: zone.id })),
];

let loadVersion = 0;
async function load(): Promise<void> {
  const version = ++loadVersion;
  loading.value = true;
  error.value = null;
  try {
    const response = await adminListSlots({
      date: filters.date,
      type: filters.type as "admission" | "parking" | "all",
      lotId: filters.type === "parking" ? filters.lotId : undefined,
    });
    // 快速切换条件时，仅最新查询可更新表格与加载状态。
    if (version !== loadVersion) return;
    if (!response.ok) {
      error.value = response.error.message;
      return;
    }
    rows.value = response.data;
  } catch {
    if (version === loadVersion) error.value = "读取失败，请重试。";
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

function openAdjust(slot: SlotView): void {
  editing.value = slot;
  quotaInput.value = String(slot.interactiveQuota);
  formError.value = null;
  fieldErrors.value = [];
}

async function submitAdjust(): Promise<void> {
  if (!editing.value || saving.value) return;
  const value = Number(quotaInput.value);
  const errors = collectErrors([
    Number.isInteger(value) && value >= 0
      ? null
      : { field: "interactiveQuota", message: "请输入非负整数（不支持小数）" },
    editing.value.interactiveBooked > value
      ? { field: "interactiveQuota", message: `不能低于已占用的 ${editing.value.interactiveBooked}` }
      : null,
  ]);
  if (errors.length) {
    fieldErrors.value = errors;
    formError.value = "配额校验未通过。";
    return;
  }
  saving.value = true;
  const response = await saveSlotCapacity({ slotId: editing.value.id, interactiveQuota: value });
  saving.value = false;
  if (!response.ok) {
    formError.value = response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  pushToast("success", `已更新配额为 ${value}，余量 ${response.data.remaining}。`);
  editing.value = null;
  await load();
}

const quotaHint = computed(() => {
  if (!editing.value) return "";
  return `当前已占 ${editing.value.interactiveBooked}，余量 ${editing.value.remaining}；只修改现场配额（interactiveQuota）。`;
});

watch(() => [filters.date, filters.type, filters.lotId], load);
onMounted(load);
</script>

<template>
  <FlowPage>
    <PageHeader
      title="预约配额"><template #actions><ScheduleEditor @saved="load"/></template></PageHeader>

    <FlowFilters :model="filters" :primary="['slot-date', 'slot-type', 'slot-lot']" search="" :busy="loading" @submit="load" @reset="() => { filters.date = today; filters.type = 'admission'; filters.lotId = 'all'; load(); }"><template #default="{ filter }">
      <FormField label="日期" field="slot-date">
        <input id="slot-date" class="input" type="date" v-model="filter.date"/>
      </FormField>
      <FormField label="类型" field="slot-type">
        <SelectInput
          id="slot-type"
          v-model="filter.type"
          :options="[
            { value: 'admission', label: '入园（人）' },
            { value: 'parking', label: '停车（辆）' },
          ]"
        />
      </FormField>
      <FormField v-if="filter.type === 'parking'" label="停车场" field="slot-lot">
        <SelectInput id="slot-lot" v-model="filter.lotId" :options="lotOptions" />
      </FormField>
    </template></FlowFilters>

    <FlowPanel>
      <AsyncSection :retain="rows.length > 0" :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'period', label: '时段' },
            { key: 'interactiveQuota', label: filters.type === 'parking' ? '现场配额（辆）' : '现场配额（人）' },
            { key: 'interactiveBooked', label: '已占配额' },
            { key: 'remaining', label: '余量' },
            { key: 'bookable', label: '可约状态' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="rows as unknown as Array<Record<string, unknown>>"
          :row-key="(row) => String(row.id)"
          :caption="filters.type === 'parking' ? '停车配额只影响预约名额，不改变实际停车余位' : '入园配额单位为“人”，含已消费的现场预约'"
          empty-text="该日期没有预置档位。"
        >
          <template #cell-period="{ row }">
            <span class="stack"><span class="muted small num">{{ row.date }}</span><span class="num">{{ row.start }}—{{ row.end }}{{ row.lotId ? ` · ${row.lotId}` : "" }}</span></span>
          </template>
          <template #cell-unit="{ row }">
            {{ row.type === "admission" ? "人" : "辆" }}
          </template>
          <template #cell-interactiveQuota="{ row }">
            <span class="num">{{ row.interactiveQuota }}</span>
          </template>
          <template #cell-interactiveBooked="{ row }">
            <span class="num">{{ row.interactiveBooked }}</span>
          </template>
          <template #cell-remaining="{ row }">
            <span class="num">{{ row.remaining }}</span>
          </template>
          <template #cell-bookable="{ row }">
            <span class="stack" style="gap: 2px">
              <StatusTag :label="row.bookable ? '可预约' : '不可约'" :tone="row.bookable ? 'success' : 'warning'" />
              <span v-if="row.unbookableReason" class="muted small">{{ row.unbookableReason }}</span>
            </span>
          </template>
          <template #cell-actions="{ row }">
            <AdminButton
              size="sm"
              :disabled="row.unbookableReason === '时段已结束'"
              :disabled-reason="'该时段已经结束，配额只读'"
              @click="openAdjust(row as unknown as SlotView)"
            >
              调整配额
            </AdminButton>
          </template>
        </DataTable>
        <p v-if="rows.some((slot) => slot.unbookableReason === '时段已结束')" class="inline-note">
          已结束档位只读；“余量”与“可约”分别展示，有剩余名额不代表一定能进场。
        </p>
      </AsyncSection>
    </FlowPanel>

    <Teleport to="body"><div v-if="editing" class="modal-overlay" @mousedown.self="closeAdjust">
      <LiquidGlassSurface class="modal flow-modal" :radius="22" :blur="8" :tint-opacity="0.94" :inert="saving" role="dialog" aria-modal="true" aria-label="调整配额">
        <header class="modal__header">
          <h2>调整现场配额</h2>
          <AdminButton size="sm" @click="closeAdjust">关闭</AdminButton>
        </header>
        <div class="modal__body">
          <p class="muted small" style="margin: 0">
            时段 {{ editing.date }} {{ editing.start }}—{{ editing.end }}{{ editing.lotId ? ` · ${editing.lotId}` : "" }}（{{ editing.unit === "person" ? "人" : "辆" }}）
          </p>
          <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>
          <FormField label="现场配额" field="interactiveQuota" required unit="非负整数" :errors="fieldErrors" :hint="quotaHint">
            <template #default="{ invalid }">
              <input
                id="interactiveQuota"
                v-model="quotaInput"
                class="input"
                type="number"
                min="0"
                step="1"
                :aria-invalid="invalid || undefined"
              />
            </template>
          </FormField>
          <p class="inline-note">背景预约量、实体容量与时段起止不在本页修改。</p>
        </div>
        <footer class="modal__footer">
          <AdminButton @click="closeAdjust">取消</AdminButton>
          <AdminButton variant="primary" :loading="saving" @click="submitAdjust">保存配额</AdminButton>
        </footer>
      </LiquidGlassSurface>
    </div></Teleport>
  </FlowPage>
</template>
