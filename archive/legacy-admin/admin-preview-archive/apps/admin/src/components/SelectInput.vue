<script setup lang="ts">
defineProps<{
  id: string;
  modelValue: string;
  options: Array<{ value: string; label: string }>;
  invalid?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <select
    :id="id"
    class="select"
    :value="modelValue"
    :aria-invalid="invalid || undefined"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
</template>
