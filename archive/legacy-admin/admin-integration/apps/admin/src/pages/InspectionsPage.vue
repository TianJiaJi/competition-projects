<script setup lang="ts">
import { useDraftGuard } from "../app/use-draft-guard";
import { cachedFilters } from "../app/filter-cache";
import { computed, onMounted, reactive, ref } from "vue";
import { askConfirm, pushToast } from "../app/state";
import { dateTimeText } from "../app/format";
import type { FieldError } from "../core/result";
import { LIMITS } from "../core/validate";
import { businessNow, toDateString } from "../core/time";
import type { InspectionPlanView } from "../services/inspections";
import {
  createInspectionPlan,
  listInspectionPlans,
  setInspectionPlanEnabled,
  updateInspectionPlan,
  willGenerateRecord,
  type InspectionPlanInput,
  type InspectionQuery,
} from "../services/inspections";
import { listSafetyFacilityOptions } from "../services/facilities";
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

const filters = cachedFilters("inspections", { keyword: "", enabled: "all", due: "all", page: 1, pageSize: 20 });
const result = ref<ListResult<InspectionPlanView> | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const facilityOptions = ref<Array<{ id: string; name: string }>>([]);
const drawerOpen = ref(false);
const editingId = ref<string | null>(null);
const form = ref<InspectionPlanInput>({ facilityId: "", intervalDays: 30, nextDueDate: toDateString(businessNow()), instructions: "", enabled: true });
const saving = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const busyId = ref<string | null>(null);

const baseline = ref("");
const discardDraft = useDraftGuard(() => drawerOpen.value && JSON.stringify(form.value) !== baseline.value, "检修计划尚未保存。", () => saving.value);
async function closeDrawer(): Promise<void> {
  if (await discardDraft()) drawerOpen.value = false;
}

const facilitySelectOptions = computed(() => [
  { value: "", label: "请选择安全设施" },
  ...facilityOptions.value.map((option) => ({ value: option.id, label: `${option.name}（${option.id}）` })),
]);

const willGenerate = computed(() => willGenerateRecord({ id: editingId.value ?? undefined, enabled: form.value.enabled, nextDueDate: form.value.nextDueDate }));

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await listInspectionPlans({
    keyword: filters.keyword,
    enabled: filters.enabled === "all" ? "all" : filters.enabled === "enabled",
    due: filters.due as InspectionQuery["due"],
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

async function loadFacilities(): Promise<void> {
  const response = await listSafetyFacilityOptions();
  facilityOptions.value = response.ok ? response.data : [];
}

function openCreate(): void {
  editingId.value = null;
  form.value = {
    facilityId: facilityOptions.value[0]?.id ?? "",
    intervalDays: 30,
    nextDueDate: toDateString(businessNow()),
    instructions: "",
    enabled: true,
  };
  formError.value = null;
  fieldErrors.value = [];
  baseline.value = JSON.stringify(form.value);
  drawerOpen.value = true;
}

function openEdit(plan: InspectionPlanView): void {
  editingId.value = plan.id;
  form.value = {
    facilityId: plan.facilityId,
    intervalDays: plan.intervalDays,
    nextDueDate: plan.nextDueDate,
    instructions: plan.instructions,
    enabled: plan.enabled,
  };
  formError.value = null;
  fieldErrors.value = [];
  baseline.value = JSON.stringify(form.value);
  drawerOpen.value = true;
}

async function submit(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const response = editingId.value
    ? await updateInspectionPlan(editingId.value, { ...form.value })
    : await createInspectionPlan({ ...form.value });
  saving.value = false;
  if (!response.ok) {
    formError.value =
      response.error.code === "INSPECTION_PLAN_CONFLICT"
        ? `${response.error.message}${response.error.details?.length ? `（${response.error.details.join("、")}）` : ""}`
        : response.error.code === "VALIDATION_ERROR"
          ? "检修计划校验未通过，请检查标红字段。"
          : response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  pushToast("success", "检修计划已保存；到期且启用的计划只生成一条待处理告警。");
  drawerOpen.value = false;
  await load();
}

async function toggleEnabled(plan: InspectionPlanView): Promise<void> {
  const next = !plan.enabled;
  const confirmed = await askConfirm({
    title: next ? "启用检修计划" : "停用检修计划",
    message: next ? `启用 ${plan.facilityName} 的检修计划（${plan.id}）。` : `停用 ${plan.facilityName} 的检修计划（${plan.id}）。`,
    details: next
      ? ["同一设施只能有一份启用中的计划；到期会生成一条待处理检修告警。"]
      : ["已有检修告警保留，不会删除历史记录；本期不提供删除计划的操作。"],
    confirmText: next ? "启用" : "停用",
    danger: !next,
  });
  if (!confirmed) return;
  busyId.value = plan.id;
  const response = await setInspectionPlanEnabled(plan.id, next);
  busyId.value = null;
  if (!response.ok) {
    pushToast("error", `${response.error.message}${response.error.details?.length ? `（${response.error.details.join("、")}）` : ""}`);
    return;
  }
  pushToast("success", next ? "计划已启用。" : "计划已停用（历史记录保留）。");
  await load();
}

onMounted(async () => {
  await loadFacilities();
  await load();
});
</script>

<template>
  <section class="stack">
    <PageHeader
      title="检修计划"
      description="全局计划配置；到期只生成一条待处理检修告警，本期没有分派、开始或完成按钮。"
    >
      <template #actions>
        <AdminButton variant="primary" @click="openCreate">新增计划</AdminButton>
      </template>
    </PageHeader>

    <FilterBar
      :busy="loading"
      @submit="search"
      @reset="() => { filters.keyword = ''; filters.enabled = 'all'; filters.due = 'all'; filters.page = 1; load(); }"
    >
      <FormField label="设施关键词" field="plan-keyword">
        <TextInput id="plan-keyword" v-model="filters.keyword" placeholder="设施名称或计划 ID" />
      </FormField>
      <FormField label="启用状态" field="plan-enabled">
        <SelectInput
          id="plan-enabled"
          v-model="filters.enabled"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'enabled', label: '启用中' },
            { value: 'disabled', label: '已停用' },
          ]"
        />
      </FormField>
      <FormField label="到期状态" field="plan-due">
        <SelectInput
          id="plan-due"
          v-model="filters.due"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'due', label: '已到期' },
            { value: 'upcoming', label: '未到期' },
          ]"
        />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'id', label: '计划 ID' },
            { key: 'facilityName', label: '设施及类别' },
            { key: 'intervalDays', label: '周期（天）' },
            { key: 'nextDueDate', label: '下次检修日期' },
            { key: 'enabled', label: '启用状态' },
            { key: 'dueStatus', label: '到期状态' },
            { key: 'relatedAlertCount', label: '关联告警数' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          empty-text="没有符合条件的检修计划。"
        >
          <template #cell-facilityName="{ row }">
            <span class="stack" style="gap: 2px">
              <span>{{ row.facilityName }}</span>
              <span class="muted small">{{ row.facilityId }} · {{ row.category === "safety" ? "安全设施" : row.category }}</span>
            </span>
          </template>
          <template #cell-nextDueDate="{ row }">
            <span class="num">{{ row.nextDueDate }}</span>
          </template>
          <template #cell-enabled="{ row }">
            <StatusTag :label="row.enabled ? '启用中' : '已停用'" :tone="row.enabled ? 'success' : 'neutral'" />
          </template>
          <template #cell-dueStatus="{ row }">
            <StatusTag
              :label="row.dueStatus === 'due' ? '已到期' : row.dueStatus === 'upcoming' ? '未到期' : '停用'"
              :tone="row.dueStatus === 'due' ? 'warning' : 'neutral'"
            />
          </template>
          <template #cell-actions="{ row }">
            <span class="btn-group">
              <AdminButton size="sm" @click="openEdit(row as unknown as InspectionPlanView)">编辑</AdminButton>
              <AdminButton size="sm" :loading="busyId === row.id" @click="toggleEnabled(row as unknown as InspectionPlanView)">
                {{ row.enabled ? "停用" : "启用" }}
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
      :inert="saving"
      :title="editingId ? '编辑检修计划' : '新增检修计划'"
      subtitle="计划有记录后不可更换关联设施；停用计划退出使用，不删除记录"
      @close="closeDrawer"
    >
      <form class="form-stack" @submit.prevent="submit">
        <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>

        <FormField label="安全设施" field="facilityId" required :errors="fieldErrors" hint="从 15 处预置安全设施中选择">
          <template #default="{ invalid }">
            <SelectInput
              id="facilityId"
              v-model="form.facilityId"
              :invalid="invalid"
              :disabled="Boolean(editingId)"
              :options="facilitySelectOptions"
            />
          </template>
        </FormField>
        <p v-if="editingId" class="inline-note">已有记录的计划不能更换关联设施，如需变更请停用后新建。</p>

        <div class="form-grid">
          <FormField label="周期天数" field="intervalDays" required unit="正整数" :errors="fieldErrors">
            <template #default="{ invalid }">
              <input id="intervalDays" v-model.number="form.intervalDays" class="input" type="number" min="1" step="1" :aria-invalid="invalid || undefined" />
            </template>
          </FormField>
          <FormField label="下次检修日期" field="nextDueDate" required unit="上海业务日期" :errors="fieldErrors">
            <template #default="{ invalid }">
              <input id="nextDueDate" v-model="form.nextDueDate" class="input" type="date" :aria-invalid="invalid || undefined" />
            </template>
          </FormField>
        </div>

        <FormField label="检修说明" field="instructions" required :errors="fieldErrors" :hint="`1—${LIMITS.instruction.max} 字`">
          <template #default="{ invalid }">
            <TextInput id="instructions" v-model="form.instructions" textarea :rows="4" :invalid="invalid" :maxlength="LIMITS.instruction.max" />
          </template>
        </FormField>

        <label class="checkbox-row">
          <input v-model="form.enabled" type="checkbox" />
          启用计划（新增默认启用）
        </label>

        <p v-if="willGenerate" class="inline-note">
          <span class="tag tag--warning">保存将新增记录</span> 该计划已到期且启用，本次保存会生成一条 pending 检修告警（同一期只生成一次）。
        </p>
        <p v-else class="inline-note">当前到期日未到期或计划停用，本次保存不会生成检修告警。</p>
      </form>

      <template #footer>
        <AdminButton variant="primary" :loading="saving" @click="submit">保存计划</AdminButton>
        <AdminButton @click="closeDrawer">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
