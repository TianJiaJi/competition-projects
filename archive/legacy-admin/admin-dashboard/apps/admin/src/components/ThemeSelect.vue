<script setup lang="ts">
import { useId } from "vue";
import { appearance, setAppearance, type AdminAppearance } from "../app/theme";
const id = useId();
</script>
<template>
  <div class="admin-appearance">
    <label :for="id">外观</label>
    <select :id="id" class="select" :value="appearance" @change="setAppearance(($event.target as HTMLSelectElement).value as AdminAppearance)">
      <option value="system">跟随系统</option>
      <option value="light">浅色</option>
      <option value="dark">深色</option>
    </select>
  </div>
</template>
