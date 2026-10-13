<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { askConfirm, pushToast } from "../app/state";
import { dateTimeText } from "../app/format";
import { LIMITS } from "../core/validate";
import { MUTE_MINUTES } from "../core/validate";
import type { FieldError } from "../core/result";
import type { ChatMessageView, ChatRoomView, MuteView, ReportDetail, ReportView } from "../services/chat";
import {
  getChatMessages,
  getReport,
  listChatRooms,
  listMutes,
  listReports,
  muteUser,
  removeMessage,
  resolveReport,
  unmuteUser,
} from "../services/chat";
import { adminListUsers, type UserView } from "../services/users";
import { useRoute } from "../router";
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

const route = useRoute();
const tab = ref<"messages" | "reports" | "mutes">((route.value.params["query.tab"] as "messages" | "reports" | "mutes") ?? "messages");

const rooms = ref<ChatRoomView[]>([]);
const activeRoom = ref<string>("");
const messages = ref<ChatMessageView[]>([]);
const hasMore = ref(false);
const messageLoading = ref(false);
const messageError = ref<string | null>(null);

const reportFilter = reactive({ status: "all" });
const reports = ref<ReportView[]>([]);
const reportsLoading = ref(false);
const reportsError = ref<string | null>(null);
const reportDetail = ref<ReportDetail | null>(null);
const reportNote = ref("");
const reportError = ref<string | null>(null);
const reportFieldErrors = ref<FieldError[]>([]);
const reportBusy = ref(false);

const mutes = ref<MuteView[]>([]);
const mutesLoading = ref(false);
const visitors = ref<UserView[]>([]);
const muteForm = reactive({ userId: "", minutes: String(MUTE_MINUTES.default), reason: "" });
const muteError = ref<string | null>(null);

const activeRoomName = computed(() => rooms.value.find((room) => room.id === activeRoom.value)?.name ?? "");

async function loadRooms(): Promise<void> {
  const response = await listChatRooms();
  if (!response.ok) {
    messageError.value = response.error.message;
    return;
  }
  rooms.value = response.data;
  if (!activeRoom.value && rooms.value.length) activeRoom.value = rooms.value[0].id;
}

async function loadMessages(beforeId?: string): Promise<void> {
  if (!activeRoom.value) return;
  messageLoading.value = true;
  messageError.value = null;
  const response = await getChatMessages({ roomId: activeRoom.value, beforeId, limit: 50 });
  messageLoading.value = false;
  if (!response.ok) {
    messageError.value = response.error.message;
    return;
  }
  hasMore.value = response.data.hasMore;
  messages.value = beforeId ? [...response.data.items, ...messages.value] : response.data.items;
}

async function switchRoom(roomId: string): Promise<void> {
  activeRoom.value = roomId;
  messages.value = [];
  await loadMessages();
}

async function loadReports(): Promise<void> {
  reportsLoading.value = true;
  reportsError.value = null;
  const response = await listReports({ status: reportFilter.status as ReportView["status"] | "all", pageSize: 50, page: 1 });
  reportsLoading.value = false;
  if (!response.ok) {
    reportsError.value = response.error.message;
    return;
  }
  reports.value = response.data.items;
}

async function loadMutes(): Promise<void> {
  mutesLoading.value = true;
  const [muteList, userList] = await Promise.all([listMutes(), adminListUsers({ identity: "visitor", pageSize: 50 })]);
  mutesLoading.value = false;
  mutes.value = muteList.ok ? muteList.data : [];
  visitors.value = userList.ok ? userList.data.items : [];
  if (!muteForm.userId && visitors.value.length) muteForm.userId = visitors.value[0].id;
}

async function switchTab(next: "messages" | "reports" | "mutes"): Promise<void> {
  tab.value = next;
  window.location.hash = `#/chat?tab=${next}`;
  if (next === "reports") await loadReports();
  if (next === "mutes") await loadMutes();
  if (next === "messages") await loadMessages();
}

async function withdraw(message: ChatMessageView): Promise<void> {
  const reason = window.prompt("请输入撤回原因（1—200 字）", "现场反馈内容不适宜保留");
  if (reason === null) return;
  const confirmed = await askConfirm({
    title: "撤回消息",
    message: `将撤回 ${message.authorNickname} 在「${activeRoomName.value}」中的消息（${message.id}）。`,
    details: ["撤回后消息正文不再由正常查询与举报详情返回，改为“该消息已被管理员撤回”。", "撤回不会自动处理关联举报，也不会自动禁言。"],
    confirmText: "撤回",
    danger: true,
  });
  if (!confirmed) return;
  const response = await removeMessage(message.id, { reason });
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", "消息已撤回。");
  messages.value = messages.value.map((item) => (item.id === message.id ? response.data : item));
}

async function openReport(id: string): Promise<void> {
  const response = await getReport(id);
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  reportDetail.value = response.data;
  reportNote.value = "";
  reportError.value = null;
  reportFieldErrors.value = [];
}

async function resolveReportAction(outcome: "resolved" | "dismissed"): Promise<void> {
  if (!reportDetail.value || reportBusy.value) return;
  reportBusy.value = true;
  reportError.value = null;
  const response = await resolveReport(reportDetail.value.report.id, { outcome, note: reportNote.value });
  reportBusy.value = false;
  if (!response.ok) {
    reportError.value = response.error.message;
    reportFieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  pushToast("success", outcome === "resolved" ? "举报已处理完成。" : "举报已驳回。");
  reportDetail.value = null;
  await loadReports();
}

async function submitMute(): Promise<void> {
  muteError.value = null;
  const response = await muteUser({
    userId: muteForm.userId,
    minutes: Number(muteForm.minutes),
    reason: muteForm.reason,
  });
  if (!response.ok) {
    muteError.value = response.error.message;
    return;
  }
  pushToast("success", `已设置禁言至 ${response.data.untilText}（同一游客重复设置会替换到期时间）。`);
  muteForm.reason = "";
  await loadMutes();
}

async function clearMute(userId: string): Promise<void> {
  const confirmed = await askConfirm({
    title: "解除禁言",
    message: "将解除该游客的禁言状态。",
    details: ["禁言作用于当前运行所有房间；解除不会撤回历史消息。"],
    confirmText: "解除禁言",
  });
  if (!confirmed) return;
  const response = await unmuteUser(userId);
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", "已解除禁言。");
  await loadMutes();
}

onMounted(async () => {
  await loadRooms();
  await loadMessages();
  if (tab.value === "reports") await loadReports();
  if (tab.value === "mutes") await loadMutes();
});

/** 同一路径下的查询参数变化（如工作台“待处理举报”入口）也要切换页签。 */
watch(
  () => route.value.params["query.tab"],
  (next) => {
    if (!next || next === tab.value) return;
    if (next !== "messages" && next !== "reports" && next !== "mutes") return;
    void switchTab(next);
  },
);
</script>

<template>
  <section class="stack">
    <PageHeader
      title="聊天管理"
      description="房间消息、举报与禁言三个页签各自独立动作：撤回不处理举报，处理举报不撤回或禁言，禁言不撤回历史消息。后台不发送消息。"
    />

    <div class="tabs" role="tablist" aria-label="聊天管理页签">
      <button class="tab" role="tab" :aria-selected="tab === 'messages'" @click="switchTab('messages')">房间消息</button>
      <button class="tab" role="tab" :aria-selected="tab === 'reports'" @click="switchTab('reports')">举报</button>
      <button class="tab" role="tab" :aria-selected="tab === 'mutes'" @click="switchTab('mutes')">禁言</button>
    </div>

    <div v-if="tab === 'messages'" class="split-layout">
      <div class="panel stack">
        <p class="section-title">聊天室</p>
        <ul class="room-list">
          <li v-for="room in rooms" :key="room.id">
            <button class="room-button" type="button" :aria-pressed="activeRoom === room.id" @click="switchRoom(room.id)">
              <span>{{ room.name }}</span>
              <br />
              <span class="muted small">{{ room.kind === "park" ? "全园" : `景点 · ${room.poiName ?? room.poiId}` }} · {{ room.messageCount }} 条</span>
            </button>
          </li>
        </ul>
        <p class="muted small" style="margin: 0">切换房间加载最近 50 条，按旧到新显示，可向前加载更多（游标翻页，不使用普通列表页码）。</p>
      </div>

      <div class="panel stack">
        <p class="section-title">{{ activeRoomName }} · 消息</p>
        <AsyncSection :loading="messageLoading && !messages.length" :error="messageError ?? undefined" :empty="!messages.length" empty-text="该聊天室还没有消息。" @retry="() => loadMessages()">
          <div class="stack">
            <div v-if="hasMore" class="btn-group">
              <AdminButton size="sm" :loading="messageLoading" @click="loadMessages(messages[0]?.id)">加载更早消息</AdminButton>
            </div>
            <ul class="message-list">
              <li v-for="message in messages" :key="message.id" class="message" :class="message.removed ? 'message--removed' : undefined">
                <div class="message__head">
                  <span class="tag">{{ message.authorNickname }}</span>
                  <span class="tag" :class="message.source === 'background' ? 'tag--warning' : 'tag--success'">
                    {{ message.source === "background" ? "背景来源" : "现场" }}
                  </span>
                  <span class="num">{{ message.atText }}</span>
                  <span class="num">{{ message.id }}</span>
                  <StatusTag :label="message.removed ? '已撤回' : '可见'" :tone="message.removed ? 'neutral' : 'success'" />
                  <span class="md-toolbar__spacer" />
                  <AdminButton v-if="!message.removed" size="sm" variant="danger" @click="withdraw(message)">撤回</AdminButton>
                </div>
                <p class="message__body">{{ message.body }}</p>
              </li>
            </ul>
          </div>
        </AsyncSection>
        <p class="muted small" style="margin: 0">只有可见消息可撤回；撤回后正文不再由正常查询与举报详情返回，后台不发送消息。</p>
      </div>
    </div>

    <div v-if="tab === 'reports'" class="stack">
      <FilterBar :busy="reportsLoading" @submit="loadReports" @reset="() => { reportFilter.status = 'all'; loadReports(); }">
        <FormField label="举报状态" field="report-status">
          <SelectInput
            id="report-status"
            v-model="reportFilter.status"
            :options="[
              { value: 'all', label: '全部状态' },
              { value: 'pending', label: '待处理' },
              { value: 'resolved', label: '已处理' },
              { value: 'dismissed', label: '已驳回' },
            ]"
          />
        </FormField>
      </FilterBar>

      <div class="panel">
        <AsyncSection :loading="reportsLoading" :error="reportsError ?? undefined" @retry="loadReports">
          <DataTable
            :columns="[
              { key: 'id', label: '举报 ID' },
              { key: 'roomName', label: '关联房间' },
              { key: 'messageId', label: '关联消息' },
              { key: 'reporterNickname', label: '举报人' },
              { key: 'reasonLabel', label: '原因' },
              { key: 'statusLabel', label: '状态' },
              { key: 'createdAtText', label: '提交时间' },
              { key: 'actions', label: '操作' },
            ]"
            :rows="reports as unknown as Array<Record<string, unknown>>"
            :row-key="(row) => String(row.id)"
            empty-text="没有符合条件的举报记录。"
          >
            <template #cell-reasonLabel="{ row }">
              {{ row.reasonLabel }}
            </template>
            <template #cell-statusLabel="{ row }">
              <StatusTag
                :label="String(row.statusLabel)"
                :tone="row.status === 'pending' ? 'warning' : row.status === 'resolved' ? 'success' : 'neutral'"
              />
            </template>
            <template #cell-actions="{ row }">
              <AdminButton size="sm" @click="openReport(String(row.id))">查看详情</AdminButton>
            </template>
          </DataTable>
        </AsyncSection>
      </div>
    </div>

    <div v-if="tab === 'mutes'" class="stack">
      <div class="split-2">
        <div class="panel stack">
          <p class="section-title">设置禁言</p>
          <p v-if="muteError" class="form-error-banner" role="alert">{{ muteError }}</p>
          <FormField label="游客" field="mute-user" required hint="员工不作为禁言对象">
            <template #default>
              <SelectInput
                id="mute-user"
                v-model="muteForm.userId"
                :options="visitors.map((visitor) => ({ value: visitor.id, label: `${visitor.nickname}（${visitor.id}${visitor.disabled ? ' · 账号已禁用' : ''}）` }))"
              />
            </template>
          </FormField>
          <FormField label="时长" field="mute-minutes" required unit="分钟" hint="1—1440 整数分钟，默认 10 分钟">
            <template #default>
              <input id="mute-minutes" v-model="muteForm.minutes" class="input" type="number" min="1" max="1440" step="1" />
            </template>
          </FormField>
          <FormField label="原因" field="mute-reason" required hint="1—200 字">
            <template #default>
              <TextInput id="mute-reason" v-model="muteForm.reason" textarea :rows="3" :maxlength="LIMITS.reason.max" />
            </template>
          </FormField>
          <div class="btn-group">
            <AdminButton variant="primary" @click="submitMute">设置禁言</AdminButton>
          </div>
          <p class="muted small" style="margin: 0">
            禁言作用于当前运行所有房间，按真实时钟到期；同一游客重复设置会替换到期时间，不叠加时长。禁言不自动撤回历史消息。
          </p>
        </div>

        <div class="panel">
          <p class="section-title">当前禁言记录</p>
          <AsyncSection :loading="mutesLoading" :empty="!mutes.length" empty-text="当前没有禁言记录。">
            <DataTable
              :columns="[
                { key: 'nickname', label: '游客' },
                { key: 'minutes', label: '时长（分钟）' },
                { key: 'untilText', label: '到期时间' },
                { key: 'reason', label: '原因' },
                { key: 'active', label: '状态' },
                { key: 'actions', label: '操作' },
              ]"
              :rows="mutes as unknown as Array<Record<string, unknown>>"
              :row-key="(row) => String(row.userId)"
              empty-text="当前没有禁言记录。"
            >
              <template #cell-active="{ row }">
                <StatusTag :label="row.active ? '禁言中' : '已解除（到期）'" :tone="row.active ? 'warning' : 'neutral'" />
              </template>
              <template #cell-actions="{ row }">
                <AdminButton size="sm" @click="clearMute(String(row.userId))">解除</AdminButton>
              </template>
            </DataTable>
          </AsyncSection>
        </div>
      </div>
    </div>

    <DrawerPanel
      v-if="reportDetail"
      :title="`举报 ${reportDetail.report.id}`"
      :subtitle="`${reportDetail.roomName} · ${reportDetail.report.reasonLabel}`"
      @close="reportDetail = null"
    >
      <p v-if="reportError" class="form-error-banner" role="alert">{{ reportError }}</p>
      <div class="definition-list">
        <span class="muted">举报人</span>
        <span>{{ reportDetail.report.reporterNickname }}</span>
        <span class="muted">状态</span>
        <span><StatusTag :label="reportDetail.report.statusLabel" :tone="reportDetail.report.status === 'pending' ? 'warning' : 'success'" /></span>
        <span class="muted">提交时间</span>
        <span class="num">{{ reportDetail.report.createdAtText }}</span>
        <template v-if="reportDetail.report.note">
          <span class="muted">处理说明</span>
          <span>{{ reportDetail.report.note }}（{{ reportDetail.report.handledBy }} · {{ dateTimeText(reportDetail.report.handledAt) }}）</span>
        </template>
      </div>

      <div class="panel stack">
        <p class="section-title">关联消息</p>
        <p v-if="!reportDetail.message" class="muted">关联消息缺失，不伪造内容。</p>
        <template v-else>
          <p class="inline-note">
            {{ reportDetail.message.authorNickname }} · {{ reportDetail.message.atText }} ·
            <StatusTag :label="reportDetail.message.removed ? '已撤回（占位显示）' : '可见'" :tone="reportDetail.message.removed ? 'neutral' : 'success'" />
          </p>
          <p class="message__body">{{ reportDetail.message.body }}</p>
        </template>
      </div>

      <template v-if="reportDetail.report.status === 'pending'">
        <FormField label="处理说明" field="note" required hint="1—300 字；处理与驳回都必须填写">
          <template #default="{ invalid }">
            <TextInput id="note" v-model="reportNote" textarea :rows="3" :invalid="invalid" :maxlength="LIMITS.reportNote.max" />
          </template>
        </FormField>
        <p v-if="reportFieldErrors.length" class="field__error" role="alert">{{ reportFieldErrors[0].message }}</p>
      </template>
      <p v-else class="muted small" style="margin: 0">已处理记录只读，不能重新打开或重复结案。</p>

      <template #footer>
        <template v-if="reportDetail.report.status === 'pending'">
          <AdminButton variant="danger" :loading="reportBusy" @click="resolveReportAction('dismissed')">驳回</AdminButton>
          <AdminButton variant="primary" :loading="reportBusy" @click="resolveReportAction('resolved')">处理完成</AdminButton>
        </template>
        <AdminButton v-else @click="reportDetail = null">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>
