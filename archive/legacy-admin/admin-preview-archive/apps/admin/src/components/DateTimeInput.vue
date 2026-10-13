<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    modelValue: string;
    invalid?: boolean;
    disabled?: boolean;
    min?: string;
    max?: string;
  }>(),
  {},
);
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <input
    :id="id"
    class="input"
    type="datetime-local"
    :value="modelValue"
    :aria-invalid="invalid || undefined"
    :disabled="disabled"
    :min="min"
    :max="max"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
