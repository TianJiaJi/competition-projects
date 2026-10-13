<script setup lang="ts">
import { ref, nextTick, onUnmounted } from "vue";
import { onLoad, onShow, onHide, onPageScroll } from "@dcloudio/uni-app";
import {
  createConversation,
  getHistory,
  getConversations,
  ask,
  request,
  ensureSession,
} from "../../services/qa";
import type { QaMessage, Source, QaWorkbench } from "../../services/qa";
import AnswerText from "../../components/AnswerText.vue";
import Icon from "../../components/Icon.vue";
const poiId = ref(""),
  conversationId = ref(""),
  input = ref(""),
  error = ref("");
const busy = ref(false),
  loading = ref(true),
  historyMode = ref(false),
  follow = ref(true);
const messages = ref<QaMessage[]>([]),
  openSources = ref<string[]>([]),
  knowledge = ref<Source[]>([]);
const workbench = ref<QaWorkbench | null>(null),
  category = ref("points");
const conversations = ref<
  Array<{ id: string; poiId: string | null; createdAt: string }>
>([]);
const keyboardHeight = ref(0),
  pendingId = ref(""),
  stopping = ref(false);
let pending: ReturnType<typeof ask> | null = null,
  visible = true,
  scrollTop = 0;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
// #ifdef H5
const viewportChanged = () => {
  const viewport = window.visualViewport;
  keyboardHeight.value = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
};
window.visualViewport?.addEventListener("resize", viewportChanged);
onUnmounted(() =>
  window.visualViewport?.removeEventListener("resize", viewportChanged),
);
// #endif
const keyboard = (event: { height: number }) => {
  keyboardHeight.value = event.height;
  scrollToEnd();
};
onLoad(async (q) => {
  poiId.value = q?.poiId || "";
  conversationId.value = q?.id || "";
  historyMode.value = q?.history === "1";
  uni.onKeyboardHeightChange?.(keyboard);
  await load();
});
onShow(() => {
  visible = true;
  if (!loading.value && conversationId.value && !pending) void restore();
});
onHide(() => {
  visible = false;
  pending?.stop();
  clearTimeout(recoveryTimer);
});
onUnmounted(() => {
  visible = false;
  pending?.stop();
  clearTimeout(scrollTimer);
  clearTimeout(recoveryTimer);
  uni.offKeyboardHeightChange?.(keyboard);
});
onPageScroll((e) => {
  if (e.scrollTop < scrollTop - 8) follow.value = false;
  scrollTop = e.scrollTop;
});
function scrollToEnd(force = false) {
  if (force) follow.value = true;
  if (!follow.value || !visible) return;
  if (scrollTimer) return;
  scrollTimer = setTimeout(async () => {
    scrollTimer = undefined;
    await nextTick();
    uni
      .createSelectorQuery()
      .select("#qa-end")
      .boundingClientRect((rect) => {
        if (rect && !Array.isArray(rect) && follow.value)
          uni.pageScrollTo({
            scrollTop: scrollTop + (rect.top || 0),
            duration: 100,
          });
      })
      .exec();
  }, 100);
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    await ensureSession();
    workbench.value = await request<QaWorkbench>(
      "/qa/workbench" +
        (poiId.value ? "?poiId=" + encodeURIComponent(poiId.value) : ""),
    );
    if (historyMode.value) conversations.value = await getConversations();
    else if (conversationId.value) await restore();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function restore() {
  try {
    const id = conversationId.value;
    const stored = await getHistory(id);
    if (id !== conversationId.value) return;
    messages.value = stored;
    const generating = stored.find((m) => m.status === "generating");
    busy.value = !!generating;
    pendingId.value = generating?.id || "";
    if (generating && visible)
      recoveryTimer = setTimeout(() => void restore(), 1000);
  } catch (e) {
    error.value = (e as Error).message;
    busy.value = false;
  }
}
async function newConversation(removeContext = false) {
  if (busy.value) return;
  clearTimeout(recoveryTimer);
  conversationId.value = "";
  messages.value = [];
  input.value = "";
  error.value = "";
  openSources.value = [];
  knowledge.value = [];
  historyMode.value = false;
  follow.value = true;
  if (removeContext) poiId.value = "";
  await load();
}
async function showHistory() {
  if (busy.value) return;
  historyMode.value = true;
  await load();
}
async function openConversation(id: string, point: string | null) {
  conversationId.value = id;
  poiId.value = point || "";
  historyMode.value = false;
  openSources.value = [];
  knowledge.value = [];
  follow.value = true;
  await load();
  scrollToEnd(true);
}
async function stop() {
  if (!pendingId.value || stopping.value) return;
  stopping.value = true;
  try {
    const result = await request<QaMessage>(
      `/qa/conversations/${conversationId.value}/messages/${pendingId.value}/stop`,
      "POST",
    );
    const index = messages.value.findIndex((m) => m.id === result.id);
    if (index >= 0) messages.value[index] = result;
    await restore();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    stopping.value = false;
  }
}
async function send(question = input.value, retryOf?: string) {
  if (busy.value || loading.value) return;
  busy.value = true;
  error.value = "";
  knowledge.value = [];
  follow.value = true;
  let ended = false;
  try {
    if (!conversationId.value)
      conversationId.value = await createConversation(poiId.value || undefined);
    pending = ask(
      conversationId.value,
      retryOf ? { retryOf } : { text: question },
      (event, value) => {
        // Events are a presentation of server state; final history remains authoritative.
        if (
          event === "start" &&
          "messageId" in value &&
          typeof value.messageId === "string"
        ) {
          pendingId.value = value.messageId;
          if (!retryOf)
            messages.value.push({
              id: "sending-" + value.messageId,
              role: "user",
              text: question,
              status: "completed",
              sources: [],
              createdAt: new Date().toISOString(),
            });
          messages.value.push({
            id: value.messageId,
            role: "assistant",
            text: "",
            status: "generating",
            sources: [],
            createdAt: new Date().toISOString(),
          });
          input.value = "";
        }
        const answer = messages.value.find((m) => m.id === pendingId.value);
        if (answer && event === "delta" && "text" in value)
          answer.text += value.text;
        if (answer && event === "sources" && "sources" in value)
          answer.sources = value.sources;
        if (event === "done" || event === "error") {
          ended = true;
          if (answer && "status" in value) answer.status = value.status;
          if (event === "error" && "message" in value)
            error.value = value.message;
        }
        scrollToEnd();
      },
    );
    await pending.done;
    if (!ended) error.value = "连接已中断，正在同步回答记录。";
  } catch (e) {
    error.value =
      (e as Error).name === "AbortError"
        ? "连接已断开，重新进入后同步回答。"
        : (e as Error).message;
  } finally {
    pending = null;
    busy.value = false;
    if (conversationId.value) await restore();
    scrollToEnd();
  }
}
function toggleSources(id: string) {
  openSources.value = openSources.value.includes(id)
    ? openSources.value.filter((v) => v !== id)
    : [...openSources.value, id];
}
async function readKnowledge() {
  try {
    await ensureSession();
    knowledge.value = (
      await request<{ items: Source[] }>("/knowledge/sources")
    ).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <view class="page qa">
    <view class="qa-toolbar row between">
      <view
        ><text class="eyebrow">青岚山境 · 随行助手</text
        ><view class="heading">{{
          historyMode ? "问答历史" : "AI 问答"
        }}</view></view
      >
      <view class="row toolbar-actions"
        ><button class="link" :disabled="busy" @tap="showHistory">历史</button
        ><button class="link" :disabled="busy" @tap="newConversation()">
          新对话
        </button></view
      >
    </view>
    <view v-if="loading" class="empty" role="status"
      >正在整理你的问答空间…</view
    >
    <template v-else-if="historyMode">
      <button
        v-for="c in conversations"
        :key="c.id"
        class="panel history-item full"
        @tap="openConversation(c.id, c.poiId)"
      >
        <view>{{ c.poiId ? "景点问答" : "景区问答" }}</view
        ><text class="subtle"
          >{{ new Date(c.createdAt).toLocaleString("zh-CN") }} ›</text
        >
      </button>
      <view v-if="!conversations.length && !error" class="empty"
        >还没有问答记录，开始了解这一程山水吧。</view
      >
      <button class="primary full" @tap="newConversation()">开始新问答</button>
    </template>
    <template v-else>
      <view v-if="workbench?.context" class="context row between"
        ><text>当前景点 · {{ workbench.context.name }}</text
        ><button class="link" :disabled="busy" @tap="newConversation(true)">
          移除
        </button></view
      >
      <view v-if="!messages.length && workbench" class="welcome">
        <view class="assistant-mark"
          ><Icon name="message-circle" :size="28"
        /></view>
        <view class="title">山水有故事，<br />从你的好奇开始。</view>
        <view class="subtle">了解沿途风景，安排适合自己的游览。</view>
        <view class="category-tabs row"
          ><button
            v-for="c in workbench.categories"
            :key="c.id"
            :class="['category-tab', { selected: category === c.id }]"
            @tap="category = c.id"
          >
            {{ c.title }}
          </button></view
        >
        <view class="question-list"
          ><button
            v-for="q in workbench.categories.find((c) => c.id === category)
              ?.questions"
            :key="q"
            class="suggestion row between"
            :disabled="busy"
            @tap="send(q)"
          >
            <text>{{ q }}</text
            ><Icon name="arrow-up-right" :size="18" /></button
        ></view>
      </view>
      <view v-for="m in messages" :key="m.id" class="message" :class="m.role">
        <view v-if="m.role === 'user'" class="user-question"
          ><text selectable>{{ m.text }}</text></view
        >
        <view v-else class="answer-card">
          <view class="answer-label row"
            ><Icon name="message-circle" :size="18" /><text
              >青岚 · 景区助手</text
            ></view
          >
          <view
            v-if="!m.text && m.status === 'generating'"
            class="subtle"
            role="status"
            >正在整理回答…</view
          >
          <AnswerText :text="m.text" />
          <view v-if="m.status === 'stopped'" class="subtle response-status"
            >已停止回答，已生成内容保留。</view
          >
          <view
            v-if="['failed', 'interrupted'].includes(m.status)"
            class="error"
            >回答未完成</view
          >
          <button
            v-if="['failed', 'interrupted', 'stopped'].includes(m.status)"
            class="link"
            :disabled="busy"
            @tap="send('', m.id)"
          >
            重新回答
          </button>
          <button
            v-if="m.sources.length"
            class="link source-toggle"
            @tap="toggleSources(m.id)"
          >
            参考来源 · {{ m.sources.length }} 项
            {{ openSources.includes(m.id) ? "收起" : "展开" }}
          </button>
          <view v-if="openSources.includes(m.id)" class="sources"
            ><view v-for="source in m.sources" :key="source.id" class="source"
              ><view
                >{{ source.citation ? "[" + source.citation + "] " : ""
                }}{{ source.title }}</view
              ><text class="subtle body">{{ source.excerpt }}</text></view
            ></view
          >
        </view>
      </view>
      <view v-for="source in knowledge" :key="source.id" class="panel"
        ><view>{{ source.title }}</view
        ><text class="subtle body">{{ source.excerpt }}</text></view
      >
    </template>
    <view v-if="error" class="error" role="alert"
      >{{ error
      }}<button v-if="!busy" class="link" @tap="load">重新加载</button></view
    >
    <button
      v-if="error && !historyMode"
      class="secondary full"
      @tap="readKnowledge"
    >
      查看景区资料
    </button>
    <view id="qa-end" />
    <view v-if="!historyMode" class="composer-space" />
    <view
      v-if="!historyMode"
      class="composer"
      :class="{ 'keyboard-open': keyboardHeight > 0 }"
      :style="{ bottom: keyboardHeight + 'px' }"
    >
      <button
        v-if="!follow && messages.length"
        class="jump-bottom"
        @tap="scrollToEnd(true)"
      >
        回到最新回答 ↓
      </button>
      <view class="composer-inner">
        <textarea
          v-model="input"
          placeholder="想了解什么，问问青岚…"
          maxlength="1200"
          auto-height
          :adjust-position="false"
          :disabled="busy || loading"
        /><view class="row between compose-actions"
          ><text class="subtle">回答依据景区资料</text
          ><button
            v-if="busy"
            class="secondary"
            :disabled="!pendingId || stopping"
            @tap="stop"
          >
            {{ stopping ? "正在停止" : "停止回答" }}</button
          ><button
            v-else
            class="primary"
            :disabled="!input.trim() || loading"
            @tap="send()"
          >
            发送
          </button></view
        ></view
      >
    </view>
  </view>
</template>
<style scoped>
.qa {
  min-height: 100vh;
}
.qa-toolbar {
  margin-bottom: 20px;
  gap: 6px;
}
.qa-toolbar .heading {
  margin: 4px 0 0;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 1px;
  color: #536b63;
}
.toolbar-actions {
  gap: 0;
  flex-shrink: 0;
}
.context {
  background: #e0ede6e8;
  border: 1px solid #ffffff;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 13px;
}
.welcome {
  padding: 18px 0 8px;
}
.assistant-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  background: #ffffffa8;
  border: 1px solid white;
  border-radius: 18px;
  margin-bottom: 20px;
}
.welcome .title {
  font-size: 30px;
}
.category-tabs {
  gap: 4px;
  margin-top: 28px;
  padding: 4px;
  background: #dfebe5d9;
  border-radius: 16px;
}
.page .category-tab {
  flex: 1;
  min-width: 0;
  padding: 10px 2px;
  font-size: 13px;
  background: transparent;
}
.page .category-tab.selected {
  background: #f8fcfa;
  color: #175f54;
  box-shadow: 0 2px 8px #193b3509;
}
.question-list {
  margin-top: 12px;
}
.page .suggestion {
  width: 100%;
  text-align: left;
  margin-top: 8px;
  padding: 16px;
  background: #f8fcfad9;
  border: 1px solid white;
  font-size: 14px;
}
.suggestion text {
  flex: 1;
}
.message {
  margin: 22px 0;
}
.user-question {
  background: #d5e7de;
  margin-left: 32px;
  border-radius: 20px 20px 5px 20px;
  padding: 14px 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.answer-card {
  background: #f8fcfaf5;
  border: 1px solid white;
  border-radius: 20px;
  padding: 18px;
}
.answer-label {
  margin-bottom: 16px;
  font-size: 12px;
  color: #386659;
  gap: 8px;
}
.response-status {
  margin-top: 12px;
}
.sources {
  background: #eaf3ef;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
}
.source + .source {
  border-top: 1px solid #d4e2db;
  margin-top: 12px;
  padding-top: 12px;
}
.history-item {
  text-align: left;
}
.composer-space {
  height: 176px;
}
.composer {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 25;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  background: #eff6f2f5;
  border-top: 1px solid white;
  backdrop-filter: blur(16px);
}
.composer.keyboard-open {
  padding-bottom: 10px;
}
.composer-inner {
  max-width: 600px;
  margin: 0 auto;
}
.composer textarea {
  min-height: 48px;
  max-height: 108px;
  background: #ffffff;
  width: 100%;
}
.compose-actions {
  margin-top: 8px;
}
.compose-actions button {
  padding: 9px 18px;
}
.jump-bottom {
  position: absolute;
  right: 20px;
  top: -48px;
  font-size: 12px;
  box-shadow: 0 4px 20px #193b3515;
}
@media (max-width: 360px) {
  .composer {
    padding-left: 16px;
    padding-right: 16px;
  }
  .answer-card {
    padding: 14px;
  }
  .welcome .title {
    font-size: 28px;
  }
}
</style>
