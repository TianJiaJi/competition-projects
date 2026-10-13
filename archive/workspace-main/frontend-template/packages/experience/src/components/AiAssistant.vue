<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import { scenario } from "../../../../scenario/config";
import { answerQuestion, type SceneState } from "@scene/domain";
import { LiquidGlassButton } from "@scene/ui/liquid-glass";
const props = defineProps<{ state: SceneState }>();
const input = ref(""),
  busy = ref(false);
const messages = ref<{ role: string; text: string }[]>([
  {
    role: "assistant",
    text: `你好，我是${scenario.name}服务助手。报修、预约、生活服务，都可以从这里开始。`,
  },
]);
let timer: ReturnType<typeof setInterval> | undefined;
function ask(question = input.value) {
  if (busy.value || !question.trim()) return;
  messages.value.push({ role: "user", text: question });
  const answer = answerQuestion(question, scenario, props.state);
  messages.value.push({ role: "assistant", text: "" });
  const item = messages.value[messages.value.length - 1];
  input.value = "";
  busy.value = true;
  let i = 0;
  timer = setInterval(() => {
    item.text = answer.slice(0, (i += 2));
    if (i >= answer.length) {
      clearInterval(timer);
      busy.value = false;
    }
  }, 24);
}
onBeforeUnmount(() => clearInterval(timer));
</script>
<template>
  <div class="assistant">
    <p class="muted">服务助手 · 演示回答</p>
    <div class="messages" aria-live="polite">
      <p v-for="(m, i) in messages" :key="i" :class="['message', m.role]">
        {{ m.text || "正在整理回答…" }}
      </p>
    </div>
    <div class="question-list">
      <button
        v-for="q in scenario.questions"
        :key="q.question"
        :disabled="busy"
        @click="ask(q.question)"
      >
        {{ q.question }}
      </button>
    </div>
    <form class="chat-input" @submit.prevent="ask()">
      <input
        v-model="input"
        aria-label="输入问题"
        placeholder="有什么可以帮你？"
      /><LiquidGlassButton type="submit" :disabled="busy || !input.trim()"
        >发送</LiquidGlassButton
      >
    </form>
  </div>
</template>
