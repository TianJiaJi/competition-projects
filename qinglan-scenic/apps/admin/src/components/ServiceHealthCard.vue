<script setup lang="ts">
import { computed } from "vue";
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import type { serviceHealthCards } from "../core/service-health";

const props = defineProps<{ card: ReturnType<typeof serviceHealthCards>[number] }>();
const description = computed(() => {
  const { card } = props;
  if (!card.available || card.total === 0) return `${card.name}：${card.message}`;
  return `${card.name}：健康率 ${card.percentage}，健康 ${card.healthy}，异常 ${card.abnormal}，未知 ${card.unknown}`;
});

// 只裁出弧段，材质直接使用公共玻璃容器，避免多层描边和拟物高光。
const segments = computed(() => {
  const healthy = props.card.healthyPercent;
  const abnormal = props.card.abnormalPercent;
  const unknown = props.card.available && props.card.total > 0 ? props.card.unknown / props.card.total * 100 : 100;
  return [
    { kind: "healthy", percent: healthy, offset: 0 },
    { kind: "abnormal", percent: abnormal, offset: healthy },
    { kind: "unknown", percent: unknown, offset: healthy + abnormal },
  ].filter(segment => segment.percent > 0).map(segment => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="51" fill="none" stroke="white" stroke-width="11" pathLength="100" stroke-dasharray="${segment.percent} 100" stroke-dashoffset="${-segment.offset}" transform="rotate(-90 60 60)"/></svg>`;
    const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return { ...segment, style: {
      maskImage: mask, WebkitMaskImage: mask,
      "--glass-tint-rgb": `var(--health-${segment.kind}-rgb)`,
      backgroundColor: `rgb(var(--health-${segment.kind}-rgb) / var(--health-${segment.kind}-opacity, .42))`,
    } };
  });
});
</script>

<template>
  <LiquidGlassSurface as="article" class="health-card" :radius="22" :blur="2" :tint-opacity="0.16" :class="{ 'health-card--primary': card.primary }" :data-module="card.id" :aria-labelledby="`health-${card.id}`">
    <h3 :id="`health-${card.id}`">{{ card.name }}</h3>
    <div class="health-card__visual">
      <div class="health-card__ring" role="img" :aria-label="description">
        <LiquidGlassSurface
          v-for="segment in segments" :key="segment.kind"
          class="health-card__segment" :class="`health-card__segment--${segment.kind}`"
          :radius="0" :blur="2" :tint-opacity="0.42" :style="segment.style"
          :data-percent="segment.percent" :data-offset="segment.offset" aria-hidden="true"
        />
        <svg class="health-card__edges" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="56.3" />
          <circle cx="60" cy="60" r="45.7" />
        </svg>
        <div class="health-card__center" aria-hidden="true"><strong>{{ card.percentage }}</strong></div>
      </div>
      <div v-if="card.available && card.total > 0" class="health-card__counts">
        <span><i class="health-card__dot health-card__dot--healthy" aria-hidden="true" />健康 <b>{{ card.healthy }}</b></span>
        <span><i class="health-card__dot health-card__dot--abnormal" aria-hidden="true" />异常 <b>{{ card.abnormal }}</b></span>
        <span v-if="card.unknown"><i class="health-card__dot" aria-hidden="true" />未知 <b>{{ card.unknown }}</b></span>
      </div>
      <p v-else class="health-card__unavailable" :role="!card.available ? 'status' : undefined">{{ card.message }}</p>
    </div>
  </LiquidGlassSurface>
</template>

<style scoped>
.health-card { --health-healthy-rgb: 23 95 84; --health-abnormal-rgb: 179 63 54; --health-unknown-rgb: 128 143 136; --health-unknown: #c0c8c4; min-width: 0; display: flex; flex-direction: column; gap: 22px; padding: 22px 16px; font-weight: 400; }
:global(.admin-body[data-theme="dark"] .health-card) { --health-healthy-rgb: 64 203 145; --health-abnormal-rgb: 255 112 111; --health-unknown-rgb: 145 152 149; --health-healthy-opacity: .52; --health-abnormal-opacity: .62; --health-unknown-opacity: .32; --health-unknown: #919895; }
.health-card h3 { font-size: 20px; }
.health-card__visual { display: grid; justify-items: center; gap: 16px; margin-top: auto; }
.health-card__ring { position: relative; width: 134px; height: 134px; }
.health-card__segment { position: absolute; inset: 0; border: 0; box-shadow: none; mask-size: 100% 100%; -webkit-mask-size: 100% 100%; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; pointer-events: none; }
.health-card__edges { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: rgb(255 255 255 / .22); stroke-width: .5; pointer-events: none; }
.health-card__center { position: absolute; inset: 0; display: grid; place-items: center; }
.health-card__center strong { font-size: 26px; font-weight: 600; letter-spacing: -1px; font-variant-numeric: tabular-nums; line-height: 1.3; }
.health-card__counts { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; font-size: var(--admin-font-small); }
.health-card__counts span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.health-card__counts b { font-variant-numeric: tabular-nums; font-weight: 600; }
.health-card__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--health-unknown); }
.health-card__dot--healthy { background: var(--admin-success); }
.health-card__dot--abnormal { background: var(--admin-danger); }
:global(.admin-body[data-theme="dark"] .health-card__dot--healthy) { background: rgb(var(--health-healthy-rgb)); }
:global(.admin-body[data-theme="dark"] .health-card__dot--abnormal) { background: rgb(var(--health-abnormal-rgb)); }
.health-card__unavailable { margin: 0; color: var(--muted); font-size: var(--admin-font-small); }
.health-card--primary { padding: 24px; gap: 24px; }
.health-card--primary h3 { font-size: 24px; }
.health-card--primary .health-card__ring { width: 164px; height: 164px; }
.health-card--primary .health-card__center strong { font-size: 32px; }
</style>
