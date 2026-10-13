<script setup lang="ts">
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>load());
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import { cachedFilters } from "../app/filter-cache";
import { onMounted, ref } from "vue";
import { dateTimeText } from "../app/format";
import { askConfirm, pushToast } from "../app/state";
import { adminGetUser, adminListUsers, setUserDisabled, type UserView } from "../services/users";
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
import type { ListResult } from "../services/list";

interface OrderLink {
  id: string;
  type: string;
  slotLabel: string;
  status: string;
}

const route = useRoute();
const isStaff = route.value.name === "staff-users";
const identity: UserView["identity"] = isStaff ? "staff" : "visitor";
const title = isStaff ? "员工管理" : "游客管理";
const filters = cachedFilters(`users:${identity}`, { keyword: "", disabled: "all", page: 1, pageSize: 20 });
const result = ref<ListResult<UserView> | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const detail = ref<{ user: UserView; orders: OrderLink[] } | null>(null);
const detailOpen = ref(false);
const busyId = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
  const response = await adminListUsers({
    keyword: filters.keyword,
    identity,
    disabled: filters.disabled === "all" ? "all" : filters.disabled === "disabled",
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

async function search(): Promise<void> {
  filters.page = 1;
  await load();
}

async function reset(): Promise<void> {
  filters.keyword = "";
  filters.disabled = "all";
  filters.page = 1;
  await load();
}

async function openDetail(id: string): Promise<void> {
  const response = await adminGetUser(id);
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  detail.value = { user: response.data.user, orders: response.data.orders };
  detailOpen.value = true;
}

async function toggleDisabled(user: UserView): Promise<void> {
  if (isStaff || user.identity !== "visitor" || busyId.value) return;
  const next = !user.disabled;
  const confirmed = await askConfirm({
    title: next ? "禁用账号" : "恢复账号",
    message: next
      ? `将禁用游客「${user.nickname}」（${user.id}）。`
      : `将恢复游客「${user.nickname}」（${user.id}）的账号状态。`,
    details: next
      ? ["账号禁用不取消其订单，不减少在园人数，也不修改禁言状态。"]
      : ["恢复后该账号在本后台显示为可用。"],
    confirmText: next ? "禁用账号" : "恢复账号",
    danger: next,
  });
  if (!confirmed) return;
  busyId.value = user.id;
  const response = await setUserDisabled(user.id, next);
  busyId.value = null;
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", next ? "账号已禁用。" : "账号已恢复。");
  await load();
  if (detailOpen.value) await openDetail(user.id);
}

onMounted(load);
</script>

<template>
  <FlowPage>
    <PageHeader :title="title" />

    <FlowFilters :model="filters" :primary="['user-keyword', 'user-disabled']" search="user-keyword" :busy="loading" @submit="search" @reset="reset"><template #default="{ filter }">
      <FormField :label="isStaff ? '员工名称 / 账号 ID' : '游客昵称 / 账号 ID'" field="user-keyword">
        <TextInput id="user-keyword" v-model="filter.keyword" :placeholder="isStaff ? '搜索员工名称或账号 ID' : '搜索游客昵称或账号 ID'" />
      </FormField>
      <FormField label="账号状态" field="user-disabled">
        <SelectInput
          id="user-disabled"
          v-model="filter.disabled"
          :options="[
            { value: 'all', label: '全部状态' },
            { value: 'active', label: '正常' },
            { value: 'disabled', label: '已禁用' },
          ]"
        />
      </FormField>
    </template></FlowFilters>

    <FlowPanel>
      <AsyncSection :retain="Boolean(result)" :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'nickname', label: isStaff ? '员工 / 账号' : '游客 / 账号' },
            { key: 'createdAtText', label: '创建时间' },
            { key: 'disabled', label: '账号状态' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          :empty-text="isStaff ? '没有符合条件的员工账号。' : '没有符合条件的游客账号。'"
        >
          <template #cell-nickname="{ row }">
            <span>{{ row.nickname }}</span>
            <div class="muted small num">{{ row.id }}</div>
          </template>
          <template #cell-disabled="{ row }">
            <StatusTag :label="row.disabled ? '已禁用' : '正常'" :tone="row.disabled ? 'danger' : 'success'" />
          </template>
          <template #cell-actions="{ row }">
            <span class="btn-group">
              <AdminButton size="sm" @click="openDetail(String(row.id))">详情</AdminButton>
              <AdminButton
                v-if="!isStaff && row.identity === 'visitor'"
                size="sm"
                :variant="row.disabled ? 'surface' : 'danger'"
                :loading="busyId === row.id"
                @click="toggleDisabled(row as unknown as UserView)"
              >
                {{ row.disabled ? "恢复" : "禁用" }}
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
    </FlowPanel>

    <DrawerPanel v-if="detailOpen && detail" :title="detail.user.nickname" :subtitle="isStaff ? '员工账号详情' : '游客账号详情'" @close="detailOpen = false">
      <dl class="definition-list">
        <dt>账号 ID</dt>
        <dd class="num">{{ detail.user.id }}</dd>
        <dt>身份</dt>
        <dd>{{ detail.user.identity === "staff" ? "员工" : "游客" }}</dd>
        <dt>创建时间</dt>
        <dd>{{ dateTimeText(Date.parse(detail.user.createdAt.replace(" ", "T") + ":00+08:00")) }}</dd>
        <dt>账号状态</dt>
        <dd>
          <StatusTag :label="detail.user.disabled ? '已禁用' : '正常'" :tone="detail.user.disabled ? 'danger' : 'success'" />
        </dd>
        <template v-if="!isStaff">
          <dt>禁言状态</dt>
          <dd class="muted small">禁言请在聊天管理中查看与设置（账号禁用不改变禁言状态）。</dd>
        </template>
        <template v-else>
          <dt>管理范围</dt>
          <dd>员工账号仅支持查看。</dd>
        </template>
      </dl>
      <div v-if="!isStaff">
        <p class="section-title">关联现场订单</p>
        <AsyncSection :empty="!detail.orders.length" empty-text="该昵称名下没有现场订单记录。">
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px">
            <li v-for="order in detail.orders" :key="order.id" class="row" style="justify-content: space-between">
              <span class="num">{{ order.id }}</span>
              <span class="muted small">{{ order.type === "admission" ? "入园" : "停车" }} · {{ order.slotLabel }}</span>
            </li>
          </ul>
        </AsyncSection>
        <p class="muted small" style="margin: 8px 0 0">
          订单入口按联系人昵称筛选，具体信息请以订单详情为准。
        </p>
      </div>
      <template #footer>
        <AdminButton v-if="!isStaff && detail.user.identity === 'visitor'" :variant="detail.user.disabled ? 'surface' : 'danger'" :loading="busyId === detail.user.id" @click="toggleDisabled(detail.user)">
          {{ detail.user.disabled ? "恢复账号" : "禁用账号" }}
        </AdminButton>
        <AdminButton @click="detailOpen = false">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </FlowPage>
</template>
