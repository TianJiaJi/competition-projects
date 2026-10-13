<script setup lang="ts">
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
withDefaults(defineProps<{ href: string; variant?: 'surface' | 'primary'; size?: 'md' | 'sm' }>(), {
  variant: 'surface', size: 'md',
});
</script>

<template>
  <LiquidGlassSurface as="a" :href="href" :radius="14" :blur="2" :tint-opacity="0.18"
    class="btn admin-glass-link" :class="[`btn--${variant}`, size === 'sm' && 'btn--sm', variant === 'primary' && 'liquid-glass-button--primary']">
    <slot />
  </LiquidGlassSurface>
</template>
