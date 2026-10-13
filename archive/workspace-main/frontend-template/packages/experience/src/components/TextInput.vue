<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    modelValue: string | number;
    type?: string;
    placeholder?: string;
    maxlength?: number;
    invalid?: boolean;
    readonly?: boolean;
    disabled?: boolean;
    min?: number | string;
    max?: number | string;
    autocomplete?: string;
    rows?: number;
    textarea?: boolean;
  }>(),
  { type: "text" },
);
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <textarea
    v-if="textarea"
    :id="id"
    class="input"
    :value="modelValue"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :aria-invalid="invalid || undefined"
    :readonly="readonly"
    :disabled="disabled"
    :rows="rows ?? 8"
    @input="
      $emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)
    "
  />
  <input
    v-else
    :id="id"
    class="input"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :aria-invalid="invalid || undefined"
    :readonly="readonly"
    :disabled="disabled"
    :min="min"
    :max="max"
    :autocomplete="autocomplete"
    @input="
      $emit('update:modelValue', ($event.target as HTMLInputElement).value)
    "
  />
</template>
