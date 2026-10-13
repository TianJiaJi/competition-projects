<script setup lang="ts">
defineProps<{ busy?: boolean }>();
defineEmits<{ submit: []; reset: [] }>();
</script>

<template>
  <form class="filters panel" @submit.prevent="$emit('submit')">
    <slot />
    <div class="filters__actions">
      <slot name="actions" />
      <button class="btn btn--primary" type="submit" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" style="width: 14px; height: 14px" />
        查询
      </button>
      <button class="btn" type="reset" @click.prevent="$emit('reset')">重置</button>
    </div>
  </form>
</template>
