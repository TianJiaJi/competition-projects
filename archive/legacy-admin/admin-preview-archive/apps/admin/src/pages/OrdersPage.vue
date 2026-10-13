<script setup lang="ts">
import { cachedFilters } from "../app/filter-cache";
import { computed, onMounted, reactive, ref } from "vue";
import { businessNow, formatDateTime, toDateString } from "../core/time";
import { LIMITS, checkText, collectErrors } from "../core/validate";
import { createActionId, type FieldError } from "../core/result";
import { parkingStatusLabels, reservationStatusLabels, visitStatusLabels, type Order, type SlotView } from "../core/types";
import {
  adminCancelOrder,
  adminGetOrder,
  adminListOrders,
  adminListSlots,
  adminRescheduleOrder,
  type OrderQuery,
  type OrderView,
} from "../services/orders";
import type { ListResult } from "../services/list";
import { pushToast } from "../app/state";
import { contactText, dateTimeText, orderAmountText, orderSourceText, reservationTone } from "../app/format";
import { useRoute } from "../router";
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

const route = useRoute();
const today = toDateString(businessNow());
const query = route.value.params;

const filters = cachedFilters("orders", {
  type: (query["query.type"] as Order["type"]) ?? "admission",
  date: query["query.date"] ?? today,
  source: (query["query.source"] as Order["source"] | "all") ?? "onsite",
  reservationStatus: "all",
  fulfillmentStatus: "all",
  keyword: "",
  page: 1,
  pageSize: 20,
});

const result = ref<ListResult<OrderView> | null>(null);

// URL 参数（工作台跳转）优先于会话内缓存的筛选
if (query["query.date"]) filters.date = query["query.date"];
if (query["query.source"]) filters.source = query["query.source"] as Order["source"] | "all";
if (query["query.type"]) filters.type = query["query.type"] as Order["type"];
const loading = ref(false);
const error = ref<string | null>(null);
const detail = ref<OrderView | null>(null);
const detailOpen = ref(false);
const slots = ref<SlotView[]>([]);
const actionPane = ref<"none" | "cancel" | "reschedule">("none");
const cancelReason = ref("");
const rescheduleTarget = ref("");
const rescheduleNote = ref("");
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const busy = ref(false);
let cancelActionId: string | null = null;
let rescheduleActionId: string | null = null;

const fulfillmentOptions = computed(() =>
  filters.type === "admission"
    ? [
        { value: "all", label: "全部状态" },
        { value: "not_entered", label: "未入园" },
        { value: "in_park", label: "在园" },
        { value: "exited", label: "已离园" },
      ]
    : [
        { value: "all", label: "全部状态" },
        { value: "not_arrived", label: "未到场" },
        { value: "waiting", label: "等候入场" },
        { value: "parked", label: "已进场" },
        { value: "departed", label: "已离场" },
      ],
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await adminListOrders({
    type: filters.type as OrderQuery["type"],
    date: filters.date,
    source: filters.source,
    reservationStatus: filters.reservationStatus as OrderQuery["reservationStatus"],
    fulfillmentStatus: filters.fulfillmentStatus,
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
}

async function search(): Promise<void> {
  filters.page = 1;
  await load();
}

async function reset(): Promise<void> {
  filters.type = "admission";
  filters.date = today;
  filters.source = "onsite";
  filters.reservationStatus = "all";
  filters.fulfillmentStatus = "all";
  filters.keyword = "";
  filters.page = 1;
  await load();
}

async function openDetail(id: string): Promise<void> {
  const response = await adminGetOrder(id);
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  detail.value = response.data;
  detailOpen.value = true;
  actionPane.value = "none";
  cancelReason.value = "";
  rescheduleTarget.value = "";
  rescheduleNote.value = "";
  formError.value = null;
  fieldErrors.value = [];
  cancelActionId = null;
  rescheduleActionId = null;
  const slotResponse = await adminListSlots({ type: response.data.type });
  slots.value = slotResponse.ok ? slotResponse.data : [];
}

function openCancel(): void {
  actionPane.value = "cancel";
  formError.value = null;
  fieldErrors.value = [];
  if (!cancelActionId) cancelActionId = createActionId("cancel");
}

function openReschedule(): void {
  actionPane.value = "reschedule";
  formError.value = null;
  fieldErrors.value = [];
  if (!rescheduleActionId) rescheduleActionId = createActionId("reschedule");
}

async function submitCancel(): Promise<void> {
  if (!detail.value || busy.value) return;
  const errors = collectErrors([checkText(cancelReason.value, "reason", LIMITS.reason, "操作原因")]);
  if (errors.length) {
    fieldErrors.value = errors;
    formError.value = "请填写取消原因。";
    return;
  }
  busy.value = true;
  const response = await adminCancelOrder(detail.value.id, {
    reason: cancelReason.value,
    actionId: cancelActionId ?? undefined,
  });
  busy.value = false;
  if (!response.ok) {
    formError.value = response.error.message;
    return;
  }
  pushToast("success", "订单已取消；当前归属档只释放该订单名额一次。");
  detail.value = response.data;
  actionPane.value = "none";
  cancelActionId = null;
  await load();
}

async function submitReschedule(): Promise<void> {
  if (!detail.value || busy.value) return;
  if (!rescheduleTarget.value) {
    formError.value = "请选择目标时段。";
    return;
  }
  busy.value = true;
  const response = await adminRescheduleOrder(detail.value.id, {
    targetSlotId: rescheduleTarget.value,
    note: rescheduleNote.value,
    actionId: rescheduleActionId ?? undefined,
  });
  busy.value = false;
  if (!response.ok) {
    formError.value = response.error.message;
    return;
  }
  if (response.data.unchanged) {
    pushToast("info", "目标与原时段相同，视为没有变更，未重复消耗名额。");
  } else {
    pushToast("success", "改期成功：两档配额与订单在同一笔保存中更新。");
  }
  detail.value = response.data;
  actionPane.value = "none";
  rescheduleActionId = null;
  const slotResponse = await adminListSlots({ type: response.data.type });
  slots.value = slotResponse.ok ? slotResponse.data : [];
  await load();
}

const targetSlot = computed(() => slots.value.find((slot) => slot.id === rescheduleTarget.value));

onMounted(load);
</script>

<template>
  <section class="stack">
    <PageHeader
      title="订单管理"
      description="默认当天、入园、现场、全部状态；背景模拟批次只读，取消与改期在同一笔保存中更新订单与配额。"
    />

    <FilterBar :busy="loading" @submit="search" @reset="reset">
      <FormField label="类型" field="order-type">
        <SelectInput
          id="order-type"
          v-model="filters.type"
          :options="[
            { value: 'admission', label: '入园' },
            { value: 'parking', label: '停车' },
          ]"
          @update:model-value="() => { filters.fulfillmentStatus = 'all'; search(); }"
        />
      </FormField>
      <FormField label="预约日期" field="order-date">
        <input id="order-date" v-model="filters.date" class="input" type="date" />
      </FormField>
      <FormField label="来源" field="order-source">
        <SelectInput
          id="order-source"
          v-model="filters.source"
          :options="[
            { value: 'onsite', label: '现场' },
            { value: 'background', label: '背景' },
            { value: 'all', label: '全部' },
          ]"
        />
      </FormField>
      <FormField label="预约状态" field="order-reservation">
        <SelectInput
          id="order-reservation"
          v-model="filters.reservationStatus"
          :options="[
            { value: 'all', label: '全部状态' },
            { value: 'confirmed', label: '有效' },
            { value: 'cancelled', label: '已取消' },
            { value: 'expired', label: '已失效' },
          ]"
        />
      </FormField>
      <FormField label="履约状态" field="order-fulfillment">
        <SelectInput id="order-fulfillment" v-model="filters.fulfillmentStatus" :options="fulfillmentOptions" />
      </FormField>
      <FormField label="关键词" field="order-keyword">
        <TextInput id="order-keyword" v-model="filters.keyword" placeholder="订单号、联系人、电话、车牌" />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'id', label: '订单编号' },
            { key: 'type', label: '类型' },
            { key: 'slotLabel', label: '预约日期与时段' },
            { key: 'source', label: '来源' },
            { key: 'contact', label: '联系人' },
            { key: 'amount', label: '人数 / 辆数' },
            { key: 'reservationStatus', label: '预约状态' },
            { key: 'fulfillment', label: '履约状态' },
            { key: 'createdAt', label: '创建时间' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          empty-text="当前筛选下没有订单；工作台跳转会带上日期与来源筛选。"
        >
          <template #cell-type="{ row }">
            <StatusTag :label="row.type === 'admission' ? '入园' : '停车'" :tone="row.type === 'admission' ? 'info' : 'neutral'" />
          </template>
          <template #cell-slotLabel="{ row }">
            <span class="num">{{ row.slotLabel }}</span>
          </template>
          <template #cell-source="{ row }">
            <StatusTag :label="row.source === 'background' ? '背景模拟批次' : '现场'" :tone="row.source === 'background' ? 'warning' : 'success'" />
          </template>
          <template #cell-contact="{ row }">
            <span class="small">{{ contactText(row as unknown as Order) }}</span>
          </template>
          <template #cell-amount="{ row }">
            <span class="num">{{ orderAmountText(row as unknown as Order) }}</span>
          </template>
          <template #cell-reservationStatus="{ row }">
            <StatusTag
              :label="String(reservationStatusLabels[row.reservationStatus as keyof typeof reservationStatusLabels])"
              :tone="reservationTone(row.reservationStatus as never)"
            />
          </template>
          <template #cell-fulfillment="{ row }">
            {{ row.type === "admission" ? visitStatusLabels[row.visitStatus as keyof typeof visitStatusLabels] : parkingStatusLabels[row.parkingStatus as keyof typeof parkingStatusLabels] }}
          </template>
          <template #cell-createdAt="{ row }">
            <span class="num small">{{ dateTimeText(Number(row.createdAt)) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <AdminButton size="sm" @click="openDetail(String(row.id))">详情</AdminButton>
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
      v-if="detailOpen && detail"
      :wide="true"
      :title="`订单 ${detail.id}`"
      :subtitle="detail.type === 'admission' ? '入园订单详情' : '停车订单详情'"
      @close="detailOpen = false"
    >
      <dl class="definition-list">
        <dt>预约类型</dt>
        <dd>{{ detail.type === "admission" ? "入园（只读）" : "停车（只读）" }}</dd>
        <dt>预约日期与时段</dt>
        <dd class="num">{{ detail.slotLabel }}</dd>
        <dt>来源</dt>
        <dd>{{ orderSourceText(detail) }}{{ detail.batchId ? ` · 批次 ${detail.batchId}` : "" }}</dd>
        <dt>联系人</dt>
        <dd>{{ contactText(detail) }}</dd>
        <template v-if="detail.type === 'admission'">
          <dt>人数</dt>
          <dd class="num">{{ detail.people ?? "—" }} 人</dd>
        </template>
        <template v-else>
          <dt>辆数 / 车牌</dt>
          <dd class="num">{{ detail.vehicles ?? "—" }} 辆 · {{ detail.plate ?? "—" }}</dd>
        </template>
        <template v-if="detail.type === 'parking'">
          <dt>预约停车场</dt>
          <dd>{{ detail.parkingLotId ?? "—" }}</dd>
          <dt>实际停车场</dt>
          <dd>{{ detail.actualParkingLotId ?? "尚未进场（与预约停车场可能不同）" }}</dd>
        </template>
        <dt>预约状态</dt>
        <dd>
          <StatusTag :label="reservationStatusLabels[detail.reservationStatus]" :tone="reservationTone(detail.reservationStatus)" />
        </dd>
        <dt>履约状态</dt>
        <dd>{{ detail.type === "admission" ? visitStatusLabels[detail.visitStatus] : parkingStatusLabels[detail.parkingStatus] }}</dd>
        <dt>创建时间</dt>
        <dd class="num">{{ dateTimeText(detail.createdAt) }}</dd>
        <dt>更新时间</dt>
        <dd class="num">{{ dateTimeText(detail.updatedAt) }}</dd>
        <template v-if="detail.type === 'admission'">
          <dt>入园时间</dt>
          <dd class="num">{{ dateTimeText(detail.enteredAt) }}</dd>
          <dt>离园时间</dt>
          <dd class="num">{{ dateTimeText(detail.exitedAt) }}</dd>
        </template>
        <template v-else>
          <dt>进场时间</dt>
          <dd class="num">{{ dateTimeText(detail.arrivedAt) }}</dd>
          <dt>离场时间</dt>
          <dd class="num">{{ dateTimeText(detail.departedAt) }}</dd>
        </template>
        <dt v-if="detail.invalidReason">失效原因</dt>
        <dd v-if="detail.invalidReason">{{ detail.invalidReason }}</dd>
      </dl>

      <div>
        <p class="section-title">本地取消／改期记录</p>
        <AsyncSection :empty="!detail.history.length" empty-text="该订单在本后台没有取消或改期记录。">
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px">
            <li v-for="(record, index) in detail.history" :key="index" class="small">
              <span class="num">{{ formatDateTime(record.at) }}</span> · {{ record.actor }} ·
              {{ record.action === "cancel" ? "取消" : "改期" }} ·
              {{ record.action === "cancel" ? record.fromSlot : `${record.fromSlot} → ${record.toSlot}` }}
              <span v-if="record.note" class="muted">（{{ record.note }}）</span>
            </li>
          </ul>
        </AsyncSection>
      </div>

      <div class="panel" style="background: #f7fbf9">
        <p class="section-title">可执行操作</p>
        <p v-if="!detail.eligibility.canCancel" class="inline-note">
          <span class="tag tag--warning">当前不可操作</span> {{ detail.eligibility.reason }}
        </p>
        <div v-else class="btn-group">
          <AdminButton size="sm" variant="danger" @click="openCancel">取消订单</AdminButton>
          <AdminButton size="sm" @click="openReschedule">改期</AdminButton>
        </div>
        <p class="muted small" style="margin: 8px 0 0">
          车牌、联系人、人数与预约类型在此只读；不展示入园二维码或人脸资料。
        </p>
      </div>

      <div v-if="actionPane === 'cancel'" class="panel stack">
        <p class="section-title">取消订单</p>
        <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>
        <p class="inline-note">
          将释放 {{ detail.type === "admission" ? `${detail.people ?? 0} 个入园名额` : `${detail.vehicles ?? 0} 个停车名额` }}，档次 {{ detail.slotLabel }}；释放只发生一次。
        </p>
        <FormField label="操作原因" field="reason" required :errors="fieldErrors" :hint="`1—${LIMITS.reason.max} 字`">
          <template #default="{ invalid }">
            <TextInput id="reason" v-model="cancelReason" textarea :rows="3" :invalid="invalid" :maxlength="LIMITS.reason.max" />
          </template>
        </FormField>
        <div class="btn-group">
          <AdminButton variant="danger" :loading="busy" @click="submitCancel">确认取消</AdminButton>
          <AdminButton @click="actionPane = 'none'">返回</AdminButton>
        </div>
      </div>

      <div v-if="actionPane === 'reschedule'" class="panel stack">
        <p class="section-title">改期</p>
        <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>
        <p class="inline-note">
          原时段 {{ detail.slotLabel }}
          <template v-if="detail.type === 'parking'"> · 预约停车场 {{ detail.parkingLotId }}（可换场）</template>
          ；涉及{{ detail.type === 'admission' ? ` ${detail.people ?? 0} 人` : ` ${detail.vehicles ?? 0} 辆` }}；目标只能是当天未结束档或次日档。
        </p>
        <FormField label="目标时段" field="targetSlot" required :errors="fieldErrors">
          <template #default="{ invalid }">
            <SelectInput
              id="targetSlot"
              v-model="rescheduleTarget"
              :invalid="invalid"
              :options="[
                { value: '', label: '请选择目标时段' },
                ...slots.map((slot) => ({
                  value: slot.id,
                  label: `${slot.date} ${slot.start}—${slot.end}${slot.lotId ? ` · ${slot.lotId}` : ''}｜余量 ${slot.remaining}/${slot.interactiveQuota}${slot.bookable ? '' : `（${slot.unbookableReason}）`}`,
                })),
              ]"
            />
          </template>
        </FormField>
        <p v-if="targetSlot" class="inline-note">
          新时段：{{ targetSlot.date }} {{ targetSlot.start }}—{{ targetSlot.end }}{{ targetSlot.lotId ? ` · ${targetSlot.lotId}` : "" }}，当前余量
          {{ targetSlot.remaining }}（{{ targetSlot.bookable ? "可约" : targetSlot.unbookableReason }}）
        </p>        <FormField label="改期说明（可选）" field="note" :errors="fieldErrors" :hint="`不超过 ${LIMITS.reason.max} 字`">
          <template #default="{ invalid }">
            <TextInput id="note" v-model="rescheduleNote" textarea :rows="2" :invalid="invalid" :maxlength="LIMITS.reason.max" />
          </template>
        </FormField>
        <div class="btn-group">
          <AdminButton variant="primary" :loading="busy" @click="submitReschedule">确认改期</AdminButton>
          <AdminButton @click="actionPane = 'none'">返回</AdminButton>
        </div>
        <p class="muted small" style="margin: 0">
          提交失败会保留原订单与原配额；同档同场视为没有变更，不会重复消耗名额。提交期间同一操作被禁用，重试沿用同一请求标识。
        </p>
      </div>

      <template #footer>
        <AdminButton @click="detailOpen = false">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
