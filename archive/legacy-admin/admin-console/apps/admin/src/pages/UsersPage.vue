<script setup lang="ts">
import { cachedFilters } from "../app/filter-cache";
import { onMounted, reactive, ref } from "vue";
import { dateTimeText } from "../app/format";
import { askConfirm, pushToast } from "../app/state";
import { adminGetUser, adminListUsers, setUserDisabled, type UserView } from "../services/users";
import { orderSlotLabel } from "../core/quota";
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
import type { ListResult } from "../services/list";

interface OrderLink {
  id: string;
  type: string;
  slotLabel: string;
  status: string;
}

const filters = cachedFilters("users", { keyword: "", identity: "all", disabled: "all", page: 1, pageSize: 20 });
const result = ref<ListResult<UserView> | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const detail = ref<{ user: UserView; orders: OrderLink[] } | null>(null);
const detailOpen = ref(false);
const busyId = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await adminListUsers({
    keyword: filters.keyword,
    identity: filters.identity as UserView["identity"] | "all",
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
}

async function search(): Promise<void> {
  filters.page = 1;
  await load();
}

async function reset(): Promise<void> {
  filters.keyword = "";
  filters.identity = "all";
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
  <section class="stack">
    <PageHeader title="用户管理" description="仅游客账号可禁用或恢复；员工账号没有角色编辑或禁用入口。" />

    <FilterBar :busy="loading" @submit="search" @reset="reset">
      <FormField label="昵称 / ID 关键词" field="user-keyword">
        <TextInput id="user-keyword" v-model="filters.keyword" placeholder="例如 山客小岚 或 visitor-1001" />
      </FormField>
      <FormField label="身份" field="user-identity">
        <SelectInput
          id="user-identity"
          v-model="filters.identity"
          :options="[
            { value: 'all', label: '全部身份' },
            { value: 'visitor', label: '游客' },
            { value: 'staff', label: '员工' },
          ]"
        />
      </FormField>
      <FormField label="账号状态" field="user-disabled">
        <SelectInput
          id="user-disabled"
          v-model="filters.disabled"
          :options="[
            { value: 'all', label: '全部状态' },
            { value: 'active', label: '正常' },
            { value: 'disabled', label: '已禁用' },
          ]"
        />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'id', label: 'ID' },
            { key: 'nickname', label: '昵称' },
            { key: 'identity', label: '身份' },
            { key: 'createdAtText', label: '创建时间' },
            { key: 'disabled', label: '账号状态' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          empty-text="没有符合条件的账号。"
        >
          <template #cell-identity="{ row }">
            <StatusTag :label="row.identity === 'staff' ? '员工' : '游客'" :tone="row.identity === 'staff' ? 'info' : 'neutral'" />
          </template>
          <template #cell-disabled="{ row }">
            <StatusTag :label="row.disabled ? '已禁用' : '正常'" :tone="row.disabled ? 'danger' : 'success'" />
          </template>
          <template #cell-actions="{ row }">
            <span class="btn-group">
              <AdminButton size="sm" @click="openDetail(String(row.id))">详情</AdminButton>
              <AdminButton
                v-if="row.identity === 'visitor'"
                size="sm"
                :variant="row.disabled ? 'surface' : 'danger'"
                :loading="busyId === row.id"
                @click="toggleDisabled(row as unknown as UserView)"
              >
                {{ row.disabled ? "恢复" : "禁用" }}
              </AdminButton>
              <span v-else class="inline-note">员工账号不支持禁用</span>
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

    <DrawerPanel v-if="detailOpen && detail" :title="detail.user.nickname" subtitle="账号详情（只读）" @close="detailOpen = false">
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
        <dt>禁言状态</dt>
        <dd class="muted small">禁言请在聊天管理中查看与设置（账号禁用不改变禁言状态）。</dd>
      </dl>
      <div>
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
          订单入口按联系人昵称匹配本地样例数据；不做真实账号与订单的关联推断。
        </p>
      </div>
      <template #footer>
        <AdminButton v-if="detail.user.identity === 'visitor'" variant="danger" @click="toggleDisabled(detail.user)">
          {{ detail.user.disabled ? "恢复账号" : "禁用账号" }}
        </AdminButton>
        <AdminButton @click="detailOpen = false">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
