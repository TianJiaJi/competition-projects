<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import GateSelect from "./GateSelect.vue";
const props = defineProps<{
  modelValue: string;
  label: string;
  placeholder: string;
  min?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const year = ref(today.slice(0, 4)),
  month = ref(today.slice(5, 7)),
  cursor = ref(today);
const years = Array.from({ length: 201 }, (_, i) => String(1900 + i));
const months = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);
const days = computed(() => {
  const y = Number(year.value),
    m = Number(month.value);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from(
      { length: count },
      (_, i) =>
        `${year.value}-${month.value}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
});
const focusDay = computed(() =>
  days.value.includes(cursor.value)
    ? cursor.value
    : days.value.find((d) => d && (!props.min || d >= props.min)),
);
function open() {
  const initial =
    props.modelValue || (props.min && props.min > today ? props.min : today);
  year.value = initial.slice(0, 4);
  month.value = initial.slice(5, 7);
  cursor.value = initial;
  dialog.value?.showModal();
  nextTick(focusCursor);
}
function close() {
  dialog.value?.close();
  trigger.value?.focus();
}
function choose(value: string) {
  if (value && props.min && value < props.min) return;
  emit("update:modelValue", value);
  close();
}
function moveMonth(delta: number) {
  const d = new Date(
    Date.UTC(Number(year.value), Number(month.value) - 1 + delta, 1),
  );
  if (d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2100) return;
  year.value = String(d.getUTCFullYear());
  month.value = String(d.getUTCMonth() + 1).padStart(2, "0");
}
function focusCursor() {
  dialog.value
    ?.querySelector<HTMLButtonElement>(`[data-day="${focusDay.value}"]`)
    ?.focus();
}
function key(event: KeyboardEvent, value: string) {
  const shifts: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (event.key in shifts) {
    event.preventDefault();
    const d = new Date(`${value}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + shifts[event.key]);
    const next = d.toISOString().slice(0, 10);
    if (
      d.getUTCFullYear() < 1900 ||
      d.getUTCFullYear() > 2100 ||
      (props.min && next < props.min)
    )
      return;
    cursor.value = next;
    year.value = next.slice(0, 4);
    month.value = next.slice(5, 7);
    nextTick(focusCursor);
  } else if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    moveMonth(event.key === "PageUp" ? -1 : 1);
    nextTick(focusCursor);
  }
}
</script>

<template>
  <span class="date-control">
    <button
      ref="trigger"
      type="button"
      class="date-trigger"
      :aria-label="label"
      aria-haspopup="dialog"
      @click="open"
    >
      <span :class="{ 'date-placeholder': !modelValue }">{{
        modelValue ? modelValue.replaceAll("-", " / ") : placeholder
      }}</span
      ><CalendarDays :size="18" :stroke-width="1.75" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <dialog
        ref="dialog"
        class="date-dialog"
        :aria-label="label"
        @cancel="close"
      >
        <div class="date-title">
          <h2>{{ label }}</h2>
          <button
            type="button"
            class="date-icon"
            aria-label="关闭日期选择"
            @click="close"
          >
            <X :size="20" />
          </button>
        </div>
        <div class="date-month">
          <button
            type="button"
            class="date-icon"
            aria-label="上个月"
            @click="moveMonth(-1)"
          >
            <ChevronLeft :size="20" /></button
          ><GateSelect v-model="year" aria-label="年份"
            ><option v-for="y in years" :key="y" :value="y">
              {{ y }}
            </option></GateSelect
          ><GateSelect v-model="month" aria-label="月份"
            ><option v-for="m in months" :key="m" :value="m">
              {{ Number(m) }} 月
            </option></GateSelect
          ><button
            type="button"
            class="date-icon"
            aria-label="下个月"
            @click="moveMonth(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
        <div
          class="date-grid"
          role="group"
          :aria-label="`${year}年${Number(month)}月`"
        >
          <span
            v-for="w in ['一', '二', '三', '四', '五', '六', '日']"
            :key="w"
            class="date-week"
            >{{ w }}</span
          ><template v-for="(day, index) in days" :key="index"
            ><button
              v-if="day"
              type="button"
              class="date-day"
              :class="{ 'is-today': day === today }"
              :data-day="day"
              :aria-label="day"
              :aria-pressed="day === modelValue"
              :tabindex="day === focusDay ? 0 : -1"
              :disabled="!!min && day < min"
              @keydown="key($event, day)"
              @click="choose(day)"
            >
              {{ Number(day.slice(-2)) }}</button
            ><span v-else aria-hidden="true"></span
          ></template>
        </div>
        <div class="date-footer">
          <button type="button" @click="choose('')">清除日期</button
          ><button
            type="button"
            :disabled="!!min && today < min"
            @click="choose(today)"
          >
            今天
          </button>
        </div>
      </dialog>
    </Teleport>
  </span>
</template>

<style scoped>
.date-control {
  display: block;
  min-width: 0;
}
.date-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 12px;
  border: 1px solid #829b8f;
  border-radius: 14px;
  background: var(--surface);
  color: var(--ink);
  text-align: left;
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
}
.date-trigger svg {
  flex-shrink: 0;
  color: var(--muted);
}
.date-placeholder {
  color: var(--muted);
}
.date-trigger:hover {
  border-color: var(--brand);
}
.date-dialog {
  width: calc(100% - 32px);
  max-width: 360px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 16px 48px rgb(25 59 53 / 18%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
}
.date-dialog::backdrop {
  background: rgb(25 59 53 / 24%);
}
.date-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.date-title h2 {
  margin: 0;
  font-size: 20px;
}
.date-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 0;
  flex-shrink: 0;
}
.date-month {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}
.date-month :deep(select) {
  padding-left: 10px;
  padding-right: 28px;
  font-size: 14px;
}
.date-month :deep(.select-arrow) {
  right: 8px;
}
.date-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}
.date-week {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  line-height: 36px;
}
.date-day {
  height: 44px;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
}
.date-day:hover {
  background: #edf5ef;
}
.date-day[aria-pressed="true"] {
  background: var(--brand);
  color: white;
}
.date-day.is-today:not([aria-pressed="true"]) {
  color: var(--brand);
  box-shadow: inset 0 0 0 1px var(--brand);
}
.date-day:disabled {
  background: transparent;
  color: #829b8f;
}
.date-footer {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  margin-top: 16px;
  padding-top: 8px;
}
.date-footer button {
  border: 0;
  background: transparent;
  color: var(--brand);
  min-height: 44px;
  padding: 8px 4px;
  font-size: 14px;
}
.date-footer button:disabled {
  color: #829b8f;
}
@media (max-width: 359px) {
  .date-dialog {
    padding: 14px;
  }
  .date-month {
    gap: 4px;
  }
  .date-icon {
    width: 32px;
  }
}
</style>
