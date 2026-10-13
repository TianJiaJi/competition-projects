<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ text: string }>();
const lines = computed(() =>
  props.text.split("\n").map((line) => {
    const heading = /^#{1,4}\s/.test(line);
    const list = /^(?:[-*]\s|\d+[.)]\s)/.test(line);
    const content = line.replace(/^#{1,4}\s/, "").replace(/^[-*]\s/, "• ");
    return {
      heading,
      list,
      blank: !line.trim(),
      parts: content
        .split(/(\*\*.*?\*\*)/g)
        .filter(Boolean)
        .map((part) => ({
          bold: part.startsWith("**") && part.endsWith("**"),
          text:
            part.startsWith("**") && part.endsWith("**")
              ? part.slice(2, -2)
              : part,
        })),
    };
  }),
);
</script>
<template>
  <view class="answer-body"
    ><view
      v-for="(line, i) in lines"
      :key="i"
      :class="{ section: line.heading, blank: line.blank, list: line.list }"
      ><text
        v-for="(part, j) in line.parts"
        :key="j"
        selectable
        :class="{ emphasis: part.bold }"
        >{{ part.text }}</text
      ></view
    ></view
  >
</template>
<style scoped>
.answer-body {
  font-size: 16px;
  line-height: 1.85;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.section {
  font-weight: 600;
  margin: 16px 0 8px;
}
.section:first-child {
  margin-top: 0;
}
.blank {
  height: 10px;
}
.list {
  padding-left: 12px;
  text-indent: -12px;
  margin: 5px 0;
}
.emphasis {
  font-weight: 600;
}
</style>
