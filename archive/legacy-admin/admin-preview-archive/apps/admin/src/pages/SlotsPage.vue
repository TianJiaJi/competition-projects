<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
import FilterBar from "../components/FilterBar.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";

const today = toDateString(businessNow());
const filters = cachedFilters("slots", { date: today, type: "admission", lotId: "all" });
const rows = ref<SlotView[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const editing = ref<SlotView | null>(null);
const quotaInput = ref("0");
const saving = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);

const dateOptions = [
  { value: today, label: `${today}（样例当天）` },
  { value: addDays(today, 1), label: `${addDays(today, 1)}（次日）` },
];
const lotOptions = [
  { value: "all", label: "全部停车场" },
  ...parkingZones.map((zone) => ({ value: zone.id, label: zone.id })),
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await adminListSlots({
    date: filters.date,
    type: filters.type as "admission" | "parking" | "all",
    lotId: filters.lotId,
  });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  rows.value = response.data;
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

onMounted(load);
</script>

<template>
  <section class="stack">
    <PageHeader
      title="预约配额"
      description="逐档修改现场配额；不改时段起止、背景预约量或实体容量。已结束档只读，场地停用的未来档仍可调整但不可约原因保持。"
    />

    <FilterBar :busy="loading" @submit="load" @reset="() => { filters.date = today; filters.type = 'admission'; filters.lotId = 'all'; load(); }">
      <FormField label="日期" field="slot-date">
        <SelectInput id="slot-date" v-model="filters.date" :options="dateOptions" />
      </FormField>
      <FormField label="类型" field="slot-type">
        <SelectInput
          id="slot-type"
          v-model="filters.type"
          :options="[
            { value: 'admission', label: '入园（人）' },
            { value: 'parking', label: '停车（辆）' },
          ]"
        />
      </FormField>
      <FormField v-if="filters.type === 'parking'" label="停车场" field="slot-lot">
        <SelectInput id="slot-lot" v-model="filters.lotId" :options="lotOptions" />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'date', label: '日期' },
            { key: 'period', label: '时段' },
            { key: 'unit', label: '单位' },
            { key: 'interactiveQuota', label: '现场配额' },
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
            <span class="num">{{ row.start }}—{{ row.end }}{{ row.lotId ? ` · ${row.lotId}` : "" }}</span>
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
    </div>

    <div v-if="editing" class="modal-overlay" @mousedown.self="editing = null">
      <div class="modal" role="dialog" aria-modal="true" aria-label="调整配额">
        <header class="modal__header">
          <h2>调整现场配额</h2>
          <AdminButton size="sm" @click="editing = null">关闭</AdminButton>
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
          <AdminButton @click="editing = null">取消</AdminButton>
          <AdminButton variant="primary" :loading="saving" @click="submitAdjust">保存配额</AdminButton>
        </footer>
      </div>
    </div>
  </section>
</template>
