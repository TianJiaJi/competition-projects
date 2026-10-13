<script setup lang="ts">
import { computed, ref } from "vue";
import { todayInShanghai, validLeaveTime, leaveBounds, formatLeaveDuration } from "@scene/bookings";
import { leaveWindowDays } from "../../../../scenario/teaching";
import FormSheet from "./FormSheet.vue";
import TimeWheel from "./TimeWheel.vue";
const props = defineProps<{ startDate: string; endDate: string; startTime: string; endTime: string }>();
const emit = defineEmits<{ close: []; apply: [value: { startDate: string; endDate: string; startTime: string; endTime: string }] }>();
const start = ref(props.startDate), end = ref(props.endDate);
const startTime = ref(props.startTime), endTime = ref(props.endTime);
const step = ref<'calendar' | 'clock'>('calendar');
const active = ref<'start' | 'end'>('start');
const timeTarget = ref<'start' | 'end'>('start');
const wheelTime = computed({ get: () => timeTarget.value === 'start' ? startTime.value : endTime.value,
  set: (value: string) => { if (timeTarget.value === 'start') startTime.value = value; else endTime.value = value; error.value = ''; } });
const duration = computed(() => {
  if (!start.value || !end.value || !validLeaveTime(startTime.value) || !validLeaveTime(endTime.value)) return '';
  const range = leaveBounds({ startDate: start.value, endDate: end.value, startTime: startTime.value, endTime: endTime.value });
  return formatLeaveDuration(range.end - range.start);
});
const today = todayInShanghai();
const lastDate = new Date(`${today}T00:00:00Z`);
lastDate.setUTCDate(lastDate.getUTCDate() + leaveWindowDays - 1);
const last = lastDate.toISOString().slice(0, 10);
const month = ref((props.startDate || today).slice(0, 7));
const error = ref('');
const dates = computed(() => {
  const [year, m] = month.value.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const blanks = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return [...Array.from({ length: blanks }, () => ''), ...Array.from({ length: count }, (_, i) => `${month.value}-${String(i + 1).padStart(2, '0')}`)];
});
function move(direction: number) {
  const date = new Date(`${month.value}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  month.value = date.toISOString().slice(0, 7);
}
function choose(value: string) {
  error.value = '';
  if (active.value === 'start') {
    start.value = value;
    if (!end.value || end.value < value) end.value = value;
    active.value = 'end';
  } else end.value = value;
}
function next() {
  error.value = '';
  if (!start.value || !end.value) { error.value = '请选择开始和结束日期'; return; }
  if (end.value < start.value) { error.value = '结束日期不能早于开始日期'; return; }
  step.value = 'clock';
  timeTarget.value = 'start';
}
function apply() {
  if (!validLeaveTime(startTime.value) || !validLeaveTime(endTime.value)) { error.value = '请选择有效的时分秒'; return; }
  const range = leaveBounds({ startDate: start.value, endDate: end.value, startTime: startTime.value, endTime: endTime.value });
  if (range.end <= range.start) { error.value = '结束时间必须晚于开始时间'; return; }
  if (range.start < Date.now()) { error.value = '开始时间不能早于当前时间'; return; }
  emit('apply', { startDate: start.value, endDate: end.value, startTime: startTime.value, endTime: endTime.value });
}
</script>
<template>
  <FormSheet :title="step === 'calendar' ? '选择请假日期' : '设置请假时间'" :description="step === 'calendar' ? '先选择起止日期，再设置具体时间' : '像设置闹钟一样，滑动选择时、分、秒'" @close="emit('close')">
    <view class="date-clock-steps"><text :class="{ current: step === 'calendar' }">01 选日期</text><text class="step-line"/><text :class="{ current: step === 'clock' }">02 选时间</text></view>
    <template v-if="step === 'calendar'">
      <view class="range-fields"><button role="button" :class="{ selected: active === 'start' }" aria-label="选择开始日期" @click="active = 'start'"><text>开始</text><text>{{ start || '请选择' }}</text></button><text class="range-divider">至</text><button role="button" :class="{ selected: active === 'end' }" aria-label="选择结束日期" @click="active = 'end'"><text>结束</text><text>{{ end || '请选择' }}</text></button></view>
      <view class="calendar-heading"><button role="button" aria-label="上个月" :disabled="month <= today.slice(0, 7)" @click="move(-1)">‹</button><text>{{ month.replace('-', ' 年 ') }} 月</text><button role="button" aria-label="下个月" :disabled="month >= last.slice(0, 7)" @click="move(1)">›</button></view>
      <view class="calendar-week"><text v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</text></view>
      <view class="calendar-grid"><template v-for="(day, i) in dates" :key="day || i"><button v-if="day" role="button" :aria-label="day" :aria-pressed="day === start || day === end" :disabled="day < today || day > last" :class="{ selected: day === start || day === end, 'in-range': day > start && day < end }" @click="choose(day)">{{ Number(day.slice(8)) }}</button><view v-else /></template></view>
    </template>
    <template v-else>
      <view class="clock-range-tabs"><button role="button" :class="{ selected: timeTarget === 'start' }" :aria-pressed="timeTarget === 'start'" aria-label="设置开始时间" @click="timeTarget = 'start'; error = ''"><text>开始 · {{ start.slice(5) }}</text><text>{{ startTime }}</text></button><button role="button" :class="{ selected: timeTarget === 'end' }" :aria-pressed="timeTarget === 'end'" aria-label="设置结束时间" @click="timeTarget = 'end'; error = ''"><text>结束 · {{ end.slice(5) }}</text><text>{{ endTime }}</text></button></view>
      <TimeWheel :key="timeTarget" v-model="wheelTime" :label="timeTarget === 'start' ? '开始' : '结束'" />
      <view class="clock-duration"><text>预计请假时长</text><text>{{ duration || '请调整起止时间' }}</text></view>
    </template>
    <text v-if="error" class="form-error" role="alert">{{ error }}</text>
    <template #footer>
      <button v-if="step === 'calendar'" role="button" class="primary-button" @click="next">下一步，选时间</button>
      <view v-else class="clock-footer-actions"><button role="button" class="clock-back" @click="step = 'calendar'; error = ''">返回日历</button><button role="button" class="primary-button" @click="apply">完成时间选择</button></view>
    </template>
  </FormSheet>
</template>
