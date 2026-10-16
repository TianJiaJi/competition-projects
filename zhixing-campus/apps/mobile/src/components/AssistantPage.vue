<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { answerQuestion } from '@scene/domain';
import { state, scenario, themeStyle } from '../store';
import { back } from '../platform';
// #ifdef H5
import { enhanceH5Accessibility } from '../platform';
// #endif
import Icon from './Icon.vue';

const welcome = () => ({ role: 'assistant', text: `你好，我是${scenario.name}服务助手。\n教室预约、报修或开放时间，都可以问我。` });
const messages = ref([welcome()]);
const input = ref('');
const busy = ref(false);
const following = ref(true);
const scrollAnchor = ref('assistant-bottom-a');
const threadHeight = ref(0);
const viewportStyle = ref<Record<string, string>>({});
const instance = getCurrentInstance();
const hasConversation = computed(() => messages.value.length > 1);
let timer: ReturnType<typeof setInterval> | undefined;
let stopAccessibility: (() => void) | undefined;
let disposeViewport: (() => void) | undefined;
let disposed = false;

function measureThread() {
  if (disposed) return;
  const query = uni.createSelectorQuery();
  if (instance?.proxy) query.in(instance.proxy);
  query.select('.assistant-thread').boundingClientRect(rect => {
    if (!Array.isArray(rect) && rect && typeof rect.height === 'number') threadHeight.value = rect.height;
  }).exec();
}
function scrollToLatest(force = false) {
  if (force) following.value = true;
  if (!following.value) return;
  void nextTick(() => {
    if (disposed || !following.value) return;
    scrollAnchor.value = scrollAnchor.value === 'assistant-bottom-a' ? 'assistant-bottom-b' : 'assistant-bottom-a';
  });
}
function onScroll(event: { detail: { scrollTop: number; scrollHeight: number } }) {
  if (!threadHeight.value) return;
  following.value = event.detail.scrollHeight - event.detail.scrollTop - threadHeight.value < 72;
}
function updateInput(event: unknown) {
  const field = event as { detail?: { value?: string }; target?: { value?: string } };
  input.value = field.detail?.value ?? field.target?.value ?? '';
}
function ask(question = input.value) {
  const text = question.trim();
  if (busy.value || !text) return;
  const answer = answerQuestion(text, scenario, state);
  messages.value.push({ role: 'user', text }, { role: 'assistant', text: '' });
  const target = messages.value[messages.value.length - 1];
  input.value = '';
  busy.value = true;
  scrollToLatest(true);
  void nextTick(measureThread);
  let length = 0;
  timer = setInterval(() => {
    target.text = answer.slice(0, length += 2);
    if (length >= answer.length) {
      clearInterval(timer);
      timer = undefined;
      busy.value = false;
    }
  }, 24);
}
function newConversation() {
  clearInterval(timer);
  timer = undefined;
  busy.value = false;
  input.value = '';
  messages.value = [welcome()];
  scrollToLatest(true);
  void nextTick(measureThread);
}
watch(() => messages.value.at(-1)?.text, () => scrollToLatest());
onMounted(() => {
  void nextTick(measureThread);
  // #ifdef H5
  stopAccessibility = enhanceH5Accessibility();
  const viewport = window.visualViewport;
  const resize = () => {
    viewportStyle.value = {
      '--assistant-height': `${viewport?.height ?? window.innerHeight}px`,
      '--assistant-top': `${viewport?.offsetTop ?? 0}px`,
    };
    void nextTick(() => { measureThread(); scrollToLatest(); });
  };
  resize();
  viewport?.addEventListener('resize', resize);
  viewport?.addEventListener('scroll', resize);
  window.addEventListener('resize', resize);
  disposeViewport = () => {
    viewport?.removeEventListener('resize', resize);
    viewport?.removeEventListener('scroll', resize);
    window.removeEventListener('resize', resize);
  };
  // #endif
});
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(timer);
  stopAccessibility?.();
  disposeViewport?.();
});
</script>

<template>
  <view class="assistant-page" :style="[themeStyle, viewportStyle]">
    <view class="assistant-header">
      <button role="button" class="assistant-back" aria-label="返回" @click="back"><view class="assistant-chevron" aria-hidden="true" /></button>
      <view class="assistant-heading"><text class="assistant-title">服务助手</text><text class="assistant-subtitle">校园服务答疑 · 预设回答</text></view>
      <button role="button" class="assistant-new" :disabled="!hasConversation" :aria-disabled="!hasConversation" @click="newConversation">新对话</button>
    </view>

    <scroll-view class="assistant-thread" scroll-y :scroll-into-view="scrollAnchor" :scroll-with-animation="false" :show-scrollbar="false" @scroll="onScroll">
      <view class="assistant-thread-inner">
        <view class="assistant-day-divider"><text />本次对话<text /></view>
        <view class="assistant-messages" role="log" aria-label="服务助手对话" :aria-busy="busy" aria-live="polite" aria-relevant="additions text">
          <view v-for="(message, index) in messages" :key="index" class="assistant-message" :class="message.role">
            <view class="assistant-avatar" :class="message.role" aria-hidden="true"><Icon v-if="message.role === 'assistant'" name="sparkles" active :size="19" /><text v-else>我</text></view>
            <view class="assistant-message-main">
              <text class="assistant-sender">{{ message.role === 'assistant' ? '知行助手' : '我' }}</text>
              <view class="assistant-bubble" :class="message.role">
                <text v-if="message.text" class="assistant-message-text" selectable>{{ message.text }}</text>
                <view v-else class="assistant-typing" role="status" aria-label="正在整理回答"><view /><view /><view /></view>
                <text v-if="busy && index === messages.length - 1 && message.text" class="assistant-caret" aria-hidden="true" />
              </view>
            </view>
          </view>
        </view>
        <view v-if="!hasConversation" class="assistant-starters">
          <text class="assistant-starters-title">你可以这样问</text>
          <button v-for="(question, index) in scenario.questions" :key="question.question" role="button" class="assistant-starter" @click="ask(question.question)">
            <view class="assistant-starter-icon" aria-hidden="true"><Icon :name="['wrench', 'calendar-days', 'building-2'][index % 3]" active :size="18" /></view>
            <text>{{ question.question }}</text><text class="assistant-starter-arrow" aria-hidden="true">↗</text>
          </button>
        </view>
        <view id="assistant-bottom-a" class="assistant-bottom-anchor" /><view id="assistant-bottom-b" class="assistant-bottom-anchor" />
      </view>
    </scroll-view>

    <view class="assistant-bottom">
      <button v-if="!following" role="button" class="assistant-jump" @click="scrollToLatest(true)">回到最新消息 <text aria-hidden="true">↓</text></button>
      <scroll-view v-if="hasConversation" scroll-x :show-scrollbar="false" class="assistant-quick-scroll">
        <view class="assistant-quick-list"><button v-for="question in scenario.questions" :key="question.question" role="button" :disabled="busy" :aria-disabled="busy" @click="ask(question.question)">{{ question.question }}</button></view>
      </scroll-view>
      <view class="assistant-composer">
        <input v-model="input" class="assistant-input" aria-label="输入问题" placeholder="问问校园里的事…" placeholder-class="assistant-input-placeholder" :maxlength="500" :adjust-position="false" :confirm-hold="true" confirm-type="send" @input="updateInput" @confirm="ask()" />
        <button role="button" class="assistant-send" aria-label="发送" :disabled="busy || !input.trim()" :aria-disabled="busy || !input.trim()" @click="ask()"><view v-if="busy" class="assistant-send-loader" aria-hidden="true" /><view v-else class="assistant-send-arrow" aria-hidden="true" /></button>
      </view>
      <text class="assistant-disclaimer">本地预设回答，仅供参考 · 具体安排以校园公告为准</text>
    </view>
  </view>
</template>

<style scoped>
.assistant-page { position:fixed; top:var(--assistant-top,0px); left:0; right:0; display:flex; flex-direction:column; width:100%; max-width:640px; height:100vh; height:var(--assistant-height,100dvh); min-height:0; margin:0 auto; padding-top:env(safe-area-inset-top); background:#f5f7fb; color:#293953; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; font-size:14px; overflow:hidden; }
.assistant-page :is(button,uni-button) { font-family:inherit; box-sizing:border-box; cursor:pointer; }
.assistant-page :is(button,uni-button)::after { border:0; }
.assistant-page :is(button,uni-button):focus-visible { outline:2px solid #7b8dbf; outline-offset:2px; }
.assistant-header { display:flex; align-items:center; gap:9px; flex:none; min-height:72px; padding:10px 16px 10px 10px; border-bottom:1px solid #e8edf6; background:#fff; }
.assistant-page .assistant-back { display:flex; align-items:center; justify-content:center; flex:none; width:44px; height:44px; margin:0; padding:0; border:0; background:transparent; border-radius:12px; }
.assistant-chevron { width:10px; height:10px; border-left:2px solid #35486f; border-bottom:2px solid #35486f; transform:translateX(2px) rotate(45deg); }
.assistant-heading { flex:1; min-width:0; }
.assistant-title { display:block; font-size:18px; font-weight:650; line-height:1.45; }
.assistant-subtitle { display:block; margin-top:3px; color:#8b96a9; font-size:10px; line-height:1.6; }
.assistant-page .assistant-new { min-height:44px; margin:0; padding:12px 2px 12px 10px; border:0; background:transparent; color:var(--brand); font-size:12px; line-height:20px; white-space:nowrap; }
.assistant-new[disabled] { opacity:.4; }
.assistant-thread { flex:1; min-height:0; height:0; width:100%; overflow:hidden; }
.assistant-thread-inner { padding:0 16px 24px; }
.assistant-day-divider { display:flex; align-items:center; justify-content:center; gap:12px; padding:23px 0 24px; color:#a4adbd; font-size:10px; }
.assistant-day-divider > :is(text,uni-text) { width:24px; height:1px; background:#e2e7f0; }
.assistant-message { display:flex; align-items:flex-start; gap:9px; margin:0 0 22px; }
.assistant-avatar { display:flex; align-items:center; justify-content:center; flex:none; width:30px; height:30px; border:1px solid #e0e7f4; border-radius:10px; background:#eef1fa; }
.assistant-avatar.user { background:#e8edf6; color:#7787aa; font-size:11px; border-color:#e3e9f4; }
.assistant-message-main { min-width:0; max-width:calc(100% - 48px); }
.assistant-sender { display:block; margin:0 0 6px 1px; color:#929db0; font-size:10px; line-height:1.5; }
.assistant-bubble { padding:13px 15px; border:1px solid #e7ecf4; border-radius:3px 16px 16px 16px; background:#fff; color:#4d5b73; font-size:14px; line-height:1.85; box-shadow:0 3px 10px #283c6702; overflow-wrap:anywhere; }
.assistant-message-text { white-space:pre-wrap; }
.assistant-message.user { flex-direction:row-reverse; }
.assistant-message.user .assistant-sender { margin-right:1px; text-align:right; }
.assistant-bubble.user { border-color:var(--brand); border-radius:16px 3px 16px 16px; background:var(--brand); color:#fff; }
.assistant-starters { margin:6px 0 10px 39px; }
.assistant-starters-title { display:block; padding:0 1px 12px; color:#95a0b2; font-size:11px; }
.assistant-page .assistant-starter { display:flex; align-items:center; gap:10px; width:100%; min-height:49px; margin:0 0 9px; padding:10px 12px; border:1px solid #e5eaf3; border-radius:12px; background:#ffffffbf; color:#5c6d8f; text-align:left; font-size:12px; line-height:1.6; }
.assistant-starter-icon { display:flex; flex:none; align-items:center; }
.assistant-starter-arrow { margin-left:auto; color:#93a0bd; }
.assistant-bottom-anchor { height:1px; width:1px; }
.assistant-bottom { position:relative; flex:none; padding:12px 16px calc(10px + env(safe-area-inset-bottom)); border-top:1px solid #e8edf6; background:#fff; }
.assistant-quick-scroll { width:100%; margin:-2px 0 10px; white-space:nowrap; }
.assistant-quick-list { display:inline-flex; gap:7px; padding:2px 1px; }
.assistant-page .assistant-quick-list :is(button,uni-button) { flex:none; display:inline-flex; align-items:center; justify-content:center; min-height:36px; margin:0; padding:8px 11px; border:1px solid #e8ecf5; border-radius:10px; background:#f8f9fd; color:#7e8da7; font-size:11px; line-height:18px; }
.assistant-quick-list :is(button,uni-button)[disabled] { opacity:.5; }
.assistant-composer { display:flex; align-items:center; gap:10px; min-height:54px; padding:5px 6px 5px 14px; border:1px solid #e3e8f3; border-radius:16px; background:#f6f8fc; }
.assistant-input { flex:1; min-width:0; height:40px; margin:0; padding:0; border:0; background:transparent; color:#344563; font-size:14px; line-height:40px; }
.assistant-input-placeholder { color:#a0aabd; }
.assistant-page .assistant-send { display:flex; align-items:center; justify-content:center; flex:none; width:40px; height:40px; margin:0; padding:0; border:0; border-radius:12px; background:var(--brand); }
.assistant-send[disabled] { background:#dce2ef; }
.assistant-send-arrow { position:relative; width:2px; height:16px; border-radius:2px; background:#fff; }
.assistant-send-arrow::before { content:""; position:absolute; top:1px; left:-4px; width:8px; height:8px; border-top:2px solid #fff; border-left:2px solid #fff; transform:rotate(45deg); }
.assistant-disclaimer { display:block; margin-top:9px; color:#a7afbd; font-size:9px; line-height:1.6; text-align:center; }
.assistant-page .assistant-jump { position:absolute; bottom:calc(100% + 12px); left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:10px; min-height:36px; margin:0; padding:8px 14px; border:1px solid #e2e8f4; border-radius:18px; background:#fff; color:var(--brand); font-size:11px; line-height:18px; white-space:nowrap; box-shadow:0 5px 18px #40558a0d; }
.assistant-typing { display:flex; align-items:center; gap:5px; min-height:23px; padding:0 3px; }
.assistant-typing > :is(view,uni-view) { width:5px; height:5px; border-radius:50%; background:#9aabd0; animation:assistant-pulse 1s ease-in-out infinite alternate; }
.assistant-typing > :is(view,uni-view):nth-child(2) { animation-delay:.15s; }
.assistant-typing > :is(view,uni-view):nth-child(3) { animation-delay:.3s; }
.assistant-caret { display:inline-block; width:2px; height:14px; margin-left:3px; vertical-align:-2px; background:#9aabd0; animation:assistant-pulse .6s ease-in-out infinite alternate; }
.assistant-send-loader { width:15px; height:15px; border:2px solid #fff6; border-top-color:#fff; border-radius:50%; animation:assistant-spin 1s linear infinite; }
@keyframes assistant-spin { to { transform:rotate(360deg); } }
@keyframes assistant-pulse { to { opacity:.25; } }
@media (max-width:360px) { .assistant-thread-inner { padding-inline:12px; } .assistant-bottom { padding-inline:12px; } .assistant-header { padding-right:12px; } .assistant-message-main { max-width:calc(100% - 39px); } .assistant-bubble { padding:11px 12px; } }
@media (prefers-reduced-motion:reduce) { .assistant-caret,.assistant-send-loader,.assistant-typing > :is(view,uni-view) { animation:none; } }
</style>
