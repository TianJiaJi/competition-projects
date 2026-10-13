<script setup lang="ts">
import { computed } from "vue";
import { Moon, Sun } from "lucide-vue-next";
import { adminTheme, setAppearance } from "../app/theme";
import AdminButton from "./AdminButton.vue";

const nextTheme = computed(() => adminTheme.value === "dark" ? "light" : "dark");
const label = computed(() => `切换为${nextTheme.value === "dark" ? "深色" : "浅色"}模式`);
</script>

<template>
  <AdminButton class="admin-theme-toggle" variant="ghost" size="sm" :aria-label="label" :title="label" @click="setAppearance(nextTheme)">
    <Sun v-if="nextTheme === 'light'" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
    <span>{{ nextTheme === 'dark' ? '深色' : '浅色' }}</span>
  </AdminButton>
</template>
