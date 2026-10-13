<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ modelValue: string; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const units = ['时', '分', '秒'];
const columns = [Array.from({ length: 24 }, (_, i) => i), Array.from({ length: 60 }, (_, i) => i), Array.from({ length: 60 }, (_, i) => i)];
const indices = computed(() => props.modelValue.split(':').map(Number));
function update(values: number[]) {
  if (values.length !== 3 || values.some((value, column) => !Number.isInteger(value) || value < 0 || value >= columns[column].length)) return;
  emit('update:modelValue', values.map((value) => String(value).padStart(2, '0')).join(':'));
}
function changed(event: { detail: { value: number[] } }) { update(event.detail.value); }
function keydown(column: number, event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const values = [...indices.value];
  const max = columns[column].length - 1;
  const increments: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
  values[column] = event.key === 'Home' ? 0 : event.key === 'End' ? max : Math.max(0, Math.min(max, values[column] + increments[event.key]));
  update(values);
}
</script>
<template>
  <view class="time-wheel">
    <view class="wheel-units"><text v-for="unit in units" :key="unit">{{ unit }}</text></view>
    <picker-view class="clock-wheel" :value="indices" indicator-style="height: 48px;" indicator-class="clock-wheel-indicator" mask-class="clock-wheel-mask" @change="changed">
      <picker-view-column v-for="(options, column) in columns" :key="column" role="spinbutton" :aria-label="`${label}${units[column]}`" :aria-valuemin="0" :aria-valuemax="options.length - 1" :aria-valuenow="indices[column]" :aria-valuetext="`${String(indices[column]).padStart(2, '0')}${units[column]}`" tabindex="0" @keydown="keydown(column, $event)">
        <view v-for="value in options" :key="value" class="wheel-number" :class="{ selected: indices[column] === value }">{{ String(value).padStart(2, '0') }}</view>
      </picker-view-column>
    </picker-view>
    <text class="wheel-help">滑动选择 · 24 小时制</text>
  </view>
</template>
