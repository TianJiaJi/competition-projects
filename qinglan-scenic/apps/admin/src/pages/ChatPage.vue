<script setup lang="ts">
import ChatControls from "../components/ChatControls.vue";
import {api,sync,versionOf} from "../services/store";
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>{void loadMessages();void loadReports();void loadMutes();});
async function detectMessage(id:string){try{await api.request("/admin/moderation/check","POST",{messageId:id,expectedVersion:versionOf("messages",id)});pushToast("success","已提交AI重新检测，可在AI言论审核查看结果");}catch(e){pushToast("error",(e as Error).message);}}

import { LiquidGlassButton } from "@scenic/ui/liquid-glass";
import FlowDetails from "../components/FlowDetails.vue";
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import { useDraftGuard } from "../app/use-draft-guard";
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { askConfirm, pushToast, setHash } from "../app/state";
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
import FlowFilters from "../components/FlowFilters.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const route = useRoute();
type ChatTab = "messages" | "reports" | "mutes" | "controls";
const tab = ref<ChatTab>((route.value.params["query.tab"] as ChatTab) ?? "messages");

const rooms = ref<ChatRoomView[]>([]);
const activeRoom = ref<string>("");
const messages = ref<ChatMessageView[]>([]);
const hasMore = ref(false);
const messageLoading = ref(false);
const messageError = ref<string | null>(null);

const reportFilter = reactive({ status: "all" });
const reports = ref<ReportView[]>([]);
const reportsLoading = ref(tab.value === "reports");
const reportsError = ref<string | null>(null);
const reportDetail = ref<ReportDetail | null>(null);
const reportNote = ref("");
const reportError = ref<string | null>(null);
const reportFieldErrors = ref<FieldError[]>([]);
const reportBusy = ref(false);

const mutes = ref<MuteView[]>([]);
const mutesLoading = ref(tab.value === "mutes");
const visitors = ref<UserView[]>([]);
const muteForm = reactive({ userId: "", minutes: String(MUTE_MINUTES.default), reason: "" });
const muteError = ref<string | null>(null);

const muteBusy = ref(false);
const muteOpen = ref(false);
const readingMute = ref<MuteView | null>(null);
const mutesError = ref<string | null>(null);
const messageViewport = ref<HTMLElement>();
let messageRequest = 0;
const muteBaseline = ref(JSON.stringify(muteForm));
const discardReport = useDraftGuard(() => reportDetail.value?.report.status === "pending" && Boolean(reportNote.value), "举报处理说明尚未保存。", () => reportBusy.value);
const discardMute = useDraftGuard(() => muteOpen.value && JSON.stringify(muteForm) !== muteBaseline.value, "禁言设置尚未保存。", () => muteBusy.value);
async function closeReport(): Promise<void> {
  if (await discardReport()) reportDetail.value = null;
}

function openMute() {
  muteForm.userId = visitors.value[0]?.id ?? "";
  muteForm.minutes = String(MUTE_MINUTES.default);
  muteForm.reason = "";
  muteError.value = null;
  muteBaseline.value = JSON.stringify(muteForm);
  muteOpen.value = true;
}
async function closeMute() {
  if (!await discardMute()) return;
  Object.assign(muteForm, JSON.parse(muteBaseline.value));
  muteOpen.value = false;
}

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
  const request = ++messageRequest;
  const view = messageViewport.value;
  const top = view?.scrollTop ?? 0;
  const height = view?.scrollHeight ?? 0;
  const atBottom = !view || !messages.value.length || height - top - view.clientHeight < 40;
  messageLoading.value = true;
  messageError.value = null;
  try {
    const response = await getChatMessages({ roomId: activeRoom.value, beforeId, limit: 50 });
    if (request !== messageRequest) return;
    if (!response.ok) { messageError.value = response.error.message; return; }
    if (beforeId) {
      const ids = new Set(messages.value.map(message => message.id));
      messages.value = [...response.data.items.filter(message => !ids.has(message.id)), ...messages.value];
      hasMore.value = response.data.hasMore;
    } else if (messages.value.length) {
      const latest = new Map(response.data.items.map(message => [message.id, message]));
      const existing = new Set(messages.value.map(message => message.id));
      messages.value = [...messages.value.map(message => latest.get(message.id) ?? message), ...response.data.items.filter(message => !existing.has(message.id))];
    } else { messages.value = response.data.items; hasMore.value = response.data.hasMore; }
    await nextTick();
    if (messageViewport.value) messageViewport.value.scrollTop = beforeId ? top + messageViewport.value.scrollHeight - height : atBottom ? messageViewport.value.scrollHeight : top;
  } catch { if (request === messageRequest) messageError.value = "消息读取失败，请重试。"; }
  finally { if (request === messageRequest) messageLoading.value = false; }
}

async function switchRoom(roomId: string): Promise<void> {
  activeRoom.value = roomId;
  messages.value = [];
  await loadMessages();
}

async function loadReports(): Promise<void> {
  reportsLoading.value = true;
  reportsError.value = null;
  try {
  const response = await listReports({ status: reportFilter.status as ReportView["status"] | "all", pageSize: 50, page: 1 });
  reportsLoading.value = false;
  if (!response.ok) {
    reportsError.value = response.error.message;
    return;
  }
  reports.value = response.data.items;
  } catch { reportsError.value = "读取失败，请重试。"; }
  finally { reportsLoading.value = false; }
}

async function loadMutes(): Promise<void> {
  mutesLoading.value = true;
  mutesError.value = null;
  try {
  const [muteList, userList] = await Promise.all([listMutes(), adminListUsers({ identity: "visitor", pageSize: 50 })]);
  mutesLoading.value = false;
  if (!muteList.ok || !userList.ok) { mutesError.value = !muteList.ok ? muteList.error.message : !userList.ok ? userList.error.message : "读取失败"; return; }
  mutes.value = muteList.data;
  visitors.value = userList.ok ? userList.data.items : [];
  if (!muteForm.userId && visitors.value.length) {
    muteForm.userId = visitors.value[0].id;
    muteBaseline.value = JSON.stringify({ ...JSON.parse(muteBaseline.value), userId: muteForm.userId });
  }
  } catch { mutesError.value = "读取失败，请重试。"; }
  finally { mutesLoading.value = false; }
}

async function switchTab(next: ChatTab): Promise<void> {
  if (next === tab.value) return;
  if (!await discardReport() || !await discardMute()) return;
  await applyTab(next);
}

async function applyTab(next: ChatTab): Promise<void> {
  reportDetail.value = null;
  muteOpen.value = false;
  Object.assign(muteForm, JSON.parse(muteBaseline.value));
  tab.value = next;
  setHash(`/chat?tab=${next}`, true);
  if (next === "reports") await loadReports();
  if (next === "mutes") await loadMutes();
  if (next === "messages") { if (!rooms.value.length) await loadRooms(); await loadMessages(); }
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
  if (muteBusy.value) return;
  muteBusy.value = true;
  muteError.value = null;
  try {
  const response = await muteUser({
    userId: muteForm.userId,
    minutes: Number(muteForm.minutes),
    reason: muteForm.reason,
  });
  muteBusy.value = false;
  if (!response.ok) {
    muteError.value = response.error.message;
    return;
  }
  pushToast("success", `已设置禁言至 ${response.data.untilText}（同一游客重复设置会替换到期时间）。`);
  muteForm.reason = "";
  muteBaseline.value = JSON.stringify(muteForm);
  muteOpen.value = false;
  await loadMutes();
  } catch { muteError.value = "保存失败，输入已保留。"; }
  finally { muteBusy.value = false; }
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
  if (tab.value === "messages") { await loadRooms(); await loadMessages(); }
  if (tab.value === "reports") await loadReports();
  if (tab.value === "mutes") await loadMutes();
});

/** 同一路径下的查询参数变化（如工作台“待处理举报”入口）也要切换页签。 */
watch(
  () => route.value.params["query.tab"],
  (next) => {
    if (!next || next === tab.value) return;
    if (next !== "messages" && next !== "reports" && next !== "mutes" && next !== "controls") return;
    void applyTab(next);
  },
);
</script>

<template>
  <FlowPage>
    <PageHeader title="聊天管理">
      <template #actions><AdminButton v-if="tab === 'mutes'" variant="primary" :disabled="mutesLoading || Boolean(mutesError)" @click="openMute">设置禁言</AdminButton></template>
    </PageHeader>
    <div class="tabs" role="tablist" aria-label="聊天管理页签">
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="tab === 'messages'" @click="switchTab('messages')">房间消息</LiquidGlassButton>
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="tab === 'reports'" @click="switchTab('reports')">举报</LiquidGlassButton>
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="tab === 'mutes'" @click="switchTab('mutes')">禁言</LiquidGlassButton>
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="tab === 'controls'" @click="switchTab('controls')">房间管控</LiquidGlassButton>
    </div>
    <ChatControls v-if="tab === 'controls'" />
    <div v-if="tab === 'messages'" class="flow-chat">
      <FlowPanel class="flow-chat__rooms">
        <h2 class="section-title">聊天室</h2>
        <ul class="room-list" tabindex="0" aria-label="聊天室列表">
          <li v-for="room in rooms" :key="room.id"><LiquidGlassButton class="room-button" type="button" :aria-pressed="activeRoom === room.id" @click="switchRoom(room.id)"><span>{{ room.name }}</span><br /><span class="muted small">{{ room.kind === 'park' ? '全园' : room.poiName }} · {{ room.messageCount }} 条</span></LiquidGlassButton></li>
        </ul>
      </FlowPanel>
      <FlowPanel>
        <SelectInput class="flow-chat__room-select" id="chat-room" aria-label="聊天室" :model-value="activeRoom" :options="rooms.map(room => ({ value: room.id, label: room.name }))" @update:model-value="switchRoom(String($event))" />
        <div class="flow-chat__header"><h2 class="section-title">{{ activeRoomName || '房间消息' }}</h2><div class="btn-group"><AdminButton v-if="hasMore" size="sm" :disabled="messageLoading" @click="loadMessages(messages[0]?.id)">加载更早消息</AdminButton><AdminButton size="sm" variant="ghost" :loading="messageLoading" @click="loadMessages()">刷新</AdminButton></div></div>
        <AsyncSection :retain="messages.length > 0" :loading="messageLoading" :error="messageError ?? undefined" :empty="!messages.length" empty-text="该聊天室还没有消息。" @retry="loadMessages()">
          <ul ref="messageViewport" class="message-list" tabindex="0" aria-label="房间消息">
            <li v-for="message in messages" :key="message.id" :data-message-id="message.id" class="message" :class="message.removed ? 'message--removed' : undefined">
              <div class="message__head"><strong>{{ message.authorNickname }}</strong><span class="num">{{ message.atText }}</span><StatusTag v-if="message.removed" label="已撤回" tone="neutral" /><span class="md-toolbar__spacer" /><AdminButton size="sm" @click="detectMessage(message.id)">AI检测</AdminButton><AdminButton v-if="!message.removed" size="sm" variant="danger" @click="withdraw(message)">撤回</AdminButton></div>
              <p class="message__body">{{ message.body }}</p>
              <details class="muted small"><summary>消息信息</summary><span class="num">{{ message.id }}</span> · {{ message.source === 'background' ? '背景来源' : '现场' }}</details>
            </li>
          </ul>
        </AsyncSection>
      </FlowPanel>
    </div>
    <div v-if="tab === 'reports'" class="flow-chat-tab">
      <FlowFilters :model="reportFilter" :primary="['report-status']" :busy="reportsLoading" @submit="loadReports" @reset="() => { reportFilter.status = 'all'; loadReports(); }"><template #default="{ filter }"><FormField label="举报状态" field="report-status"><SelectInput id="report-status" v-model="filter.status" :options="[{ value: 'all', label: '全部状态' }, { value: 'pending', label: '待处理' }, { value: 'resolved', label: '已处理' }, { value: 'dismissed', label: '已驳回' }]" /></FormField></template></FlowFilters>
      <FlowPanel>
        <AsyncSection :retain="reports.length > 0" :loading="reportsLoading" :error="reportsError ?? undefined" @retry="loadReports">
          <DataTable
            scroll-key="reports"
            :columns="[
              { key: 'roomName', label: '关联房间' },
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
      </FlowPanel>

    </div>
    <FlowPanel v-if="tab === 'mutes'">
          <AsyncSection :retain="mutes.length > 0" :error="mutesError ?? undefined" @retry="loadMutes" :loading="mutesLoading" :empty="!mutes.length" empty-text="当前没有禁言记录。">
            <DataTable
              scroll-key="mutes"
              :columns="[
                { key: 'nickname', label: '游客' },
                { key: 'untilText', label: '到期时间' },
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
              <template #cell-actions="{ row }"><AdminButton size="sm" @click="readingMute = row as unknown as MuteView">查看</AdminButton>
                <AdminButton size="sm" @click="clearMute(String(row.userId))">解除</AdminButton>
              </template>
            </DataTable>
          </AsyncSection>

    </FlowPanel>
    <DrawerPanel v-if="muteOpen" title="设置禁言" :inert="muteBusy" @close="closeMute">
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

      <p class="muted small">禁言对所有房间生效。重复设置将替换到期时间，不会自动撤回历史消息。</p>
      <template #footer><AdminButton :disabled="muteBusy" @click="closeMute">取消</AdminButton><AdminButton variant="primary" :loading="muteBusy" @click="submitMute">设置禁言</AdminButton></template>
    </DrawerPanel>
    <FlowDetails v-if="readingMute" :title="readingMute.nickname + ' · 禁言记录'" :facts="[['游客 ID', readingMute.userId], ['时长（分钟）', readingMute.minutes], ['设置时间', readingMute.setAtText], ['到期时间', readingMute.untilText], ['状态', readingMute.active ? '禁言中' : '已解除（到期）'], ['原因', readingMute.reason]]" @close="readingMute = null" />
    <DrawerPanel
      v-if="reportDetail"
      :inert="reportBusy"
      :title="`举报 ${reportDetail.report.id}`"
      :subtitle="`${reportDetail.roomName} · ${reportDetail.report.reasonLabel}`"
      @close="closeReport"
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
        <AdminButton v-else @click="closeReport">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </FlowPage>
</template>
