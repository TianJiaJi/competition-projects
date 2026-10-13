<script setup lang="ts" generic="T extends string">
import { ChevronDown } from "lucide-vue-next";
defineOptions({ inheritAttrs: false });
defineProps<{ modelValue: T }>();
defineEmits<{ "update:modelValue": [value: T] }>();
</script>

<template>
  <span class="select-control">
    <select
      v-bind="$attrs"
      :value="modelValue"
      @change="
        $emit(
          'update:modelValue',
          ($event.target as HTMLSelectElement).value as T,
        )
      "
    >
      <slot />
    </select>
    <ChevronDown
      class="select-arrow"
      :size="18"
      :stroke-width="1.75"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.select-control {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}
.select-control select {
  appearance: none;
  -webkit-appearance: none;
  display: block;
  width: 100%;
  min-height: 48px;
  padding: 12px 44px 12px 16px;
  border: 1px solid #829b8f;
  border-radius: 14px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 400;
  line-height: 1.5;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 150ms,
    box-shadow 150ms;
}
.select-control select:hover {
  border-color: var(--brand);
}
.select-control select:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 3px;
}
.select-control select:disabled {
  cursor: not-allowed;
  background: #e0e7e2;
  color: var(--muted);
}
.select-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--muted);
}
/* Customizable native pickers retain keyboard, touch and label behavior.
   Browsers without this capability use their platform picker. */
@supports (appearance: base-select) {
  .select-control select,
  .select-control select::picker(select) {
    appearance: base-select;
  }
  .select-control select::picker-icon {
    display: none;
  }
  .select-control select:open {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(23 95 84 / 8%);
  }
  .select-control select:open + .select-arrow {
    transform: translateY(-50%) rotate(180deg);
    color: var(--brand);
  }
  .select-control select::picker(select) {
    margin-block: 6px;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 10px 30px rgb(25 59 53 / 14%);
    max-height: min(360px, 60dvh);
    overflow: auto;
  }
  .select-control option {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 10px;
    white-space: normal;
    overflow-wrap: anywhere;
    font: inherit;
    line-height: 1.5;
    color: var(--ink);
  }
  .select-control option:hover,
  .select-control option:focus-visible {
    background: #edf5ef;
  }
  .select-control option:checked {
    background: #e2efe8;
    color: var(--brand);
    font-weight: 500;
  }
  .select-control option::checkmark {
    order: 1;
    margin-left: auto;
    color: var(--brand);
  }
}
@media (prefers-reduced-motion: reduce) {
  .select-control select {
    transition: none;
  }
}
</style>
