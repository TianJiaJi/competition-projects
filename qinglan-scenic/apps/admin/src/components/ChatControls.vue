<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../services/store";
import { useLiveRefresh } from "../app/live-refresh";
import AdminButton from "./AdminButton.vue";
import FlowPanel from "./FlowPanel.vue";

type RoomControl = { id: string; closed: boolean; version: number; reason?: string };
type ChatControlData = { rooms: { id: string; name: string; closed: boolean }[]; global: RoomControl; controls: RoomControl[] };
type ChatRow = { id: string; version: number; authorName: string; text: string; removed?: boolean };
const data = ref<ChatControlData | null>(null);
const rows = ref<ChatRow[]>([]);
const selected = ref<string[]>([]);
const room = ref("lobby");
const reason = ref("");
const minutes = ref(60);
const busy = ref(false);
const loading = ref(false);
const error = ref("");
const feedback = ref("");
const selectedCount = computed(() => selected.value.length);
const allSelected = computed(() => rows.value.length > 0 && selectedCount.value === rows.value.length);
const selectedRemoved = computed(() => rows.value.filter(row => selected.value.includes(row.id) && row.removed).length);
const selectedVisible = computed(() => selectedCount.value - selectedRemoved.value);
const hasReason = computed(() => reason.value.trim().length > 0);

async function load() {
  loading.value = true;
  try {
    const [controls, messages] = await Promise.all([
      api.request<ChatControlData>("/admin/chat-control"),
      api.request<{ items: ChatRow[] }>(`/chat/messages?roomId=${encodeURIComponent(room.value)}&pageSize=100`),
    ]);
    data.value = controls;
    rows.value = messages.items;
    selected.value = selected.value.filter(id => rows.value.some(row => row.id === id));
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function changeRoom() {
  selected.value = [];
  await load();
}
async function write(path: string, body: Record<string, unknown>, success: string) {
  busy.value = true;
  error.value = "";
  feedback.value = "";
  try {
    await api.request(`/admin/chat-control/${path}`, "POST", body);
    selected.value = [];
    await load();
    feedback.value = success;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function control(id: string): RoomControl {
  return id === "global" ? data.value!.global : data.value!.controls.find(item => item.id === id) || { id, closed: false, version: 0 };
}
function toggle(id: string) {
  if (!data.value) return;
  const current = control(id);
  if (!current.closed && !hasReason.value) { error.value = "关闭聊天室前请填写操作原因。"; return; }
  void write("rooms", { id, closed: !current.closed, expectedVersion: current.version, reason: reason.value.trim() }, current.closed ? "聊天室已重新开放。" : "聊天室已关闭，游客端将隐藏房间与历史消息。");
}
function batch(action: "remove" | "restore" | "mute") {
  if (!selectedCount.value) { error.value = "请先选择消息。"; return; }
  if (!hasReason.value) { error.value = "批量操作前请填写原因。"; return; }
  const items = rows.value.filter(row => selected.value.includes(row.id)).map(row => ({ id: row.id, version: row.version }));
  void write("messages", { action, reason: reason.value.trim(), minutes: minutes.value, items }, action === "mute" ? `已禁言 ${items.length} 条消息的作者。` : `已${action === "remove" ? "撤回" : "恢复"} ${items.length} 条消息。`);
}
function selectAll() { selected.value = allSelected.value ? [] : rows.value.map(row => row.id); }
onMounted(load);
useLiveRefresh(load);
</script>

<template>
  <FlowPanel class="chat-control">
    <div class="chat-control__intro">
      <div><h2>房间开放状态</h2><p class="muted small">关闭后游客端隐藏房间和历史消息，管理端保留记录。重新开放后可继续聊天。</p></div>
      <AdminButton size="sm" :disabled="busy || loading" @click="load">刷新状态</AdminButton>
    </div>
    <p v-if="error" class="form-error-banner" role="alert">{{ error }}</p>
    <p v-if="feedback" class="chat-control__feedback" role="status">{{ feedback }}</p>
    <label class="chat-control__field" for="chat-control-reason">操作原因<span class="muted small">关闭房间或批量处理消息时必填</span></label>
    <input id="chat-control-reason" class="input" v-model="reason" maxlength="500" placeholder="例如：临时维护、违规信息处理" />
    <div v-if="data" class="chat-control__rooms">
      <div class="chat-control__room">
        <div><strong>全部聊天室</strong><span class="muted small">{{ data.global.closed ? `已关闭 · ${data.global.reason || '无原因'}` : '开放中' }}</span></div>
        <AdminButton size="sm" :variant="data.global.closed ? 'surface' : 'danger'" :disabled="busy || (!data.global.closed && !hasReason)" @click="toggle('global')">{{ data.global.closed ? "重新开放" : "全部关闭" }}</AdminButton>
      </div>
      <div v-for="item in data.rooms" :key="item.id" class="chat-control__room">
        <div><strong>{{ item.name }}</strong><span class="muted small">{{ data.global.closed ? '全局关闭中' : control(item.id).closed ? `已关闭 · ${control(item.id).reason || '无原因'}` : '开放中' }}</span></div>
        <AdminButton size="sm" :variant="control(item.id).closed ? 'surface' : 'danger'" :disabled="busy || data.global.closed || (!control(item.id).closed && !hasReason)" :disabled-reason="data.global.closed ? '请先重新开放全部聊天室' : undefined" @click="toggle(item.id)">{{ control(item.id).closed ? "重新开放" : "关闭房间" }}</AdminButton>
      </div>
    </div>
    <div class="chat-control__batch">
      <div class="chat-control__intro"><div><h2>批量管理最近消息</h2><p class="muted small">选择房间中的消息，可撤回、恢复或禁言作者。</p></div></div>
      <div class="chat-control__batch-toolbar">
        <label for="chat-control-room">聊天室</label>
        <select id="chat-control-room" class="select" v-model="room" @change="changeRoom"><option v-for="item in data?.rooms" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <AdminButton size="sm" :disabled="busy || loading || !rows.length" @click="selectAll">{{ allSelected ? "取消全选" : "全选本页" }}</AdminButton>
        <span class="muted small">已选 {{ selectedCount }} / {{ rows.length }} 条</span>
      </div>
      <div class="message-choices" aria-label="最近消息">
        <p v-if="loading && !rows.length" class="muted">正在读取消息…</p>
        <p v-else-if="!rows.length" class="muted">该房间暂无消息。</p>
        <label v-for="item in rows" :key="item.id" class="message-choice" :class="item.removed && 'message-choice--removed'">
          <input type="checkbox" v-model="selected" :value="item.id" />
          <span class="message-choice__content"><strong>{{ item.authorName }}</strong><span>{{ item.text }}</span></span>
          <span v-if="item.removed" class="message-choice__status">已撤回</span>
        </label>
      </div>
      <div class="chat-control__batch-actions">
        <AdminButton size="sm" :disabled="busy || !hasReason || !selectedVisible" @click="batch('remove')">批量撤回</AdminButton>
        <AdminButton size="sm" :disabled="busy || !hasReason || !selectedRemoved" @click="batch('restore')">批量恢复</AdminButton>
        <label class="chat-control__minutes">禁言时长<input class="input" type="number" min="1" max="43200" v-model.number="minutes" aria-label="禁言分钟" /><span>分钟</span></label>
        <AdminButton size="sm" :disabled="busy || !hasReason || !selectedCount || !Number.isInteger(minutes) || minutes < 1 || minutes > 43200" @click="batch('mute')">禁言所选作者</AdminButton>
      </div>
    </div>
  </FlowPanel>
</template>

<style scoped>
.chat-control { overflow: auto; gap: 16px; }
.chat-control__intro { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
.chat-control__intro h2 { margin: 0 0 4px; font-size: 1.05rem; }
.chat-control__intro p { margin: 0; }
.chat-control__feedback { margin: 0; padding: 10px 12px; border-radius: 10px; background: #e1f0e7; color: #20583d; }
.chat-control__field { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
.chat-control__rooms { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.chat-control__room { display: flex; justify-content: space-between; align-items: center; min-width: 0; gap: 10px; padding: 14px; border: 1px solid var(--admin-line, #d8e4dc); border-radius: 14px; }
.chat-control__room > div { min-width: 0; display: grid; gap: 5px; }
.chat-control__room .small { overflow-wrap: anywhere; }
.chat-control__room .btn { flex: none; }
.chat-control__batch { min-height: 0; display: grid; grid-template-rows: auto auto minmax(120px, 1fr) auto; gap: 12px; padding-top: 20px; border-top: 1px solid var(--admin-line, #d8e4dc); }
.chat-control__batch-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.chat-control__batch-toolbar .select { width: min(320px, 100%); }
.message-choices { min-height: 120px; max-height: 360px; overflow: auto; border: 1px solid var(--admin-line, #d8e4dc); border-radius: 14px; }
.message-choices > p { padding: 12px; }
.message-choice { display: flex; align-items: start; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--admin-line, #d8e4dc); cursor: pointer; }
.message-choice:last-child { border-bottom: 0; }
.message-choice:hover { background: rgb(114 168 151 / .1); }
.message-choice input { margin-top: 4px; flex: none; }
.message-choice__content { min-width: 0; display: flex; gap: 8px; flex-wrap: wrap; overflow-wrap: anywhere; }
.message-choice__content strong { flex: none; }
.message-choice__status { margin-left: auto; white-space: nowrap; color: #785319; }
.chat-control__batch-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.chat-control__minutes { display: flex; align-items: center; gap: 6px; margin-left: auto; white-space: nowrap; }
.chat-control__minutes .input { width: 80px; }
@media (max-width: 1000px) { .chat-control__rooms { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .chat-control__intro { flex-wrap: wrap; } .chat-control__batch-toolbar .select { width: 100%; } .chat-control__minutes { margin-left: 0; } }
</style>
