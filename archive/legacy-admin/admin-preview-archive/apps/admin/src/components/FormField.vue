<script setup lang="ts">
import type { FieldError } from "../core/result";

const props = defineProps<{
  label: string;
  field: string;
  required?: boolean;
  hint?: string;
  errors?: FieldError[];
  unit?: string;
}>();

function errorFor(field: string): string | undefined {
  return props.errors?.find((error) => error.field === field)?.message;
}
</script>

<template>
  <div class="field">
    <label :for="field">
      {{ label }}<span v-if="required" class="field__required" aria-hidden="true">*</span>
      <span v-if="unit" class="muted small">（{{ unit }}）</span>
    </label>
    <slot :error="errorFor(field)" :invalid="Boolean(errorFor(field))" />
    <p v-if="hint && !errorFor(field)" class="field__hint">{{ hint }}</p>
    <p v-if="errorFor(field)" class="field__error" role="alert">{{ errorFor(field) }}</p>
  </div>
</template>
