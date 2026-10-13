<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { createScenicScene, type ScenicScene } from "@scene/model/three";
import { points, pointById, kindLabels, loadLabels, regions, pointInView, safetyStatus } from "@scene/model";
import type { PublicSnapshot, RouteResult, ScenicViewMode, ScenicRegionLabel } from "@scene/contracts";
import {
  Mountain,
  Accessibility,
  CircleParking,
  CableCar,
  Store,
  MapPin,
  Ban, Monitor, ShieldCheck, HeartPulse, Cross, PhoneCall, LifeBuoy, FireExtinguisher, Tent,
} from "lucide-vue-next";
import {ScrollPresentation,type ScrollIntroState} from '@scene/ui/scroll';
import { LiquidGlassSurface } from "../liquid-glass";
import ScenicBubble from "./ScenicBubble.vue";
import ScenicPointInfo from "./ScenicPointInfo.vue";
const props = withDefaults(defineProps<{
  snapshot: PublicSnapshot;
  showRegionLabels?:boolean;
  regionLabels?:ScenicRegionLabel[];
  focusRightInset?:number;
  showLoadingProgress?:boolean;
  showPointMarkers?:boolean;
  enablePointPicking?:boolean;
  overviewScale?:number;
  autoRotate?:boolean;
  heat?: boolean;
  viewMode?: ScenicViewMode;
  currentTerminalId?: string;
  selected: string | null;
  route: RouteResult | null;
  filter?: string;
  showToilets?: boolean;
  showDetails?: boolean;
  showScroll?:boolean;
  intro?:boolean;
}>(), {showRegionLabels:true,showLoadingProgress:true,showPointMarkers:true,enablePointPicking:true,autoRotate:true,overviewScale:1,showToilets:false, showDetails:true,showScroll:false,intro:false});
const emit = defineEmits<{
  'intro-state':[state:ScrollIntroState];
  'preparation-progress':[value:number];
  select: [id: string];
  close: [];
  blank: [];
  route: [id: string];
  return: [];
  performance: [level: number];
  project: [value: Record<string, { x: number; y: number; visible: boolean }>];
}>();
const host = ref<HTMLElement>();
const selectedPoint=computed(()=>props.selected?pointById[props.selected]:undefined);
const projected = shallowRef<
  Record<string, { x: number; y: number; visible: boolean }>
>({});
const error = ref(false);
const introState=ref<ScrollIntroState>('loading');
const preparationProgress=ref(0);
const chromeVisible=computed(()=>['finishing','ready','failed'].includes(introState.value));
function setIntroState(state:ScrollIntroState){introState.value=state;emit('intro-state',state);}
function failed(){error.value=true;projected.value={};emit('project',{});setIntroState('failed');}
let scene: ScenicScene | undefined;
const safetyIcons={aed:HeartPulse,'first-aid':Cross,help:PhoneCall,lifebuoy:LifeBuoy,extinguisher:FireExtinguisher,shelter:Tent};
const icons = {
  terminal:Monitor,
  safety:ShieldCheck,
  toilet: Accessibility,
  parking: CircleParking,
  cable: CableCar,
  commercial: Store,
  entrance: MapPin,
  attraction: Mountain,
};
function update() {
  scene?.update(props.snapshot, props.viewMode ? props.viewMode==='crowd' : !!props.heat, props.selected, props.route, props.viewMode);
}
onMounted(() => {
  try {
    scene = createScenicScene(
      host.value!,
      (id) => emit("select", id),
      (value) => {projected.value = value;emit("project",value);},
      (level) => emit("performance", level),
      {enableRegionLabels:!!props.regionLabels,overviewScale:props.overviewScale,autoRotate:props.autoRotate,canSelect:(id)=>props.enablePointPicking&&selectable(id),onBlank:()=>emit('blank'),showScroll:props.showScroll,intro:props.intro,onIntroState:setIntroState,onPreparationProgress:(value)=>{preparationProgress.value=value;emit('preparation-progress',value);},onError:failed},
    );
    update();
    scene.setFocusInset(props.focusRightInset??0);
  } catch {
    failed();
  }
});
watch(() => [props.snapshot, props.heat, props.viewMode, props.selected, props.route], update, {
  deep: true,
});
watch(()=>props.focusRightInset,value=>scene?.setFocusInset(value??0));
watch(()=>props.autoRotate,value=>scene?.setAutoRotate(value));
onBeforeUnmount(() => scene?.dispose());
defineExpose({
  reset: (preserveAngle=false) => scene?.reset(preserveAngle),
  interact: () => scene?.interact(),
  resume: () => scene?.resume(),
  zoom: (f: number) => scene?.zoom(f),
  focus: (id: string) => scene?.focus(id),
  restoreFocus: () => scene?.restoreFocus(),
});
function selectable(id:string){
  const point=pointById[id];if(!point)return false;
  if(props.viewMode)return pointInView(point,props.viewMode,props.currentTerminalId);
  return (point.kind!=='toilet'||props.showToilets||props.selected===id)&&
    (!props.filter||props.filter==='all'||props.filter===point.kind||props.selected===id);
}
const markerVisible=(id:string)=>props.showPointMarkers&&projected.value[id]?.visible&&selectable(id);
const markerStatus=(id:string)=>{
  const point=pointById[id],state=props.snapshot.points[id];
  if(point.kind==='safety')return safetyStatus(state?.availability);
  if(point.kind==='terminal')return id===props.currentTerminalId?'我在这里':'游客终端';
  return state?.availability==='open'?loadLabels[state.load??'unknown']:'未开放或状态未知';
};
const markerClass=(id:string)=>{
  const point=pointById[id],state=props.snapshot.points[id];
  if(point.kind==='terminal')return 'category';
  if(point.kind==='safety')return state?.availability==='open'?'quiet':['closed','maintenance'].includes(state?.availability)?'busy':'unknown';
  return state?.availability==='open'?(point.kind==='attraction'?'category':state.load??'unknown'):'unknown';
};
function regionLabel(id:string){
  const state=props.snapshot.regions[id];
  if(state?.availability==='closed'||state?.availability==='maintenance')return '未开放';
  return state?.count==null?'人数未知':`约 ${state.count.toLocaleString('zh-CN')} 人`;
}
</script>
<template>
  <ScrollPresentation :state="introState" :progress="preparationProgress" :show-progress="showLoadingProgress" class="scene-shell">
    <div ref="host" class="scene-canvas"></div>
    <div v-if="error" class="map-fallback glass" role="alert">
      <h2>三维画面暂不可用</h2>
      <p>仍可通过页面信息列表查看当前数据。</p>
    </div>
    <div data-scrollbar="off" class="map-markers" :class="{'intro-hidden':!chromeVisible}" :inert="introState!=='ready'">
      <template v-for="point in points" :key="point.id">
        <button
          v-if="markerVisible(point.id)"
          class="map-pin"
          :class="[
            markerClass(point.id),
            {
              'is-selected': selected === point.id,
              'is-current-terminal': currentTerminalId===point.id,
              'label-below': projected[point.id]?.y < 100,
              'is-small': point.kind !== 'toilet',
            },
          ]"
          :style="{
            transform: `translate3d(${projected[point.id].x}px, ${projected[point.id].y}px, 0) ${currentTerminalId===point.id?'translate(calc(var(--pin-diameter) / -2), -50%)':'translate(-50%, -50%)'}`,
          }"
          :data-point-id="point.id" :data-kind="point.kind" :aria-label="`${point.name}，${markerStatus(point.id)}`"
          @click="scene?.interact(); emit('select', point.id)"
        >
          <span class="pin-body">
          <span class="pin-disc"
            ><component
              :is="point.safetyKind?safetyIcons[point.safetyKind]:icons[point.kind]"
              :size="currentTerminalId===point.id||point.kind === 'toilet'?21:17"
              :stroke-width="1.8"
          /><span v-if="['closed','maintenance'].includes(snapshot.points[point.id]?.availability)" class="pin-closed-badge"><Ban :size="12"/></span></span>
          <span v-if="currentTerminalId===point.id" class="current-terminal-label">我在这里</span>
          </span>
          <component
            :is="snapshot.points[point.id]?.availability==='closed'?LiquidGlassSurface:'span'"
            v-bind="snapshot.points[point.id]?.availability==='closed'?{as:'span',tintOpacity:0.09}:{}"
            :class="{'is-closed-label':snapshot.points[point.id]?.availability==='closed'}"
            v-if="currentTerminalId !== point.id && (
              selected === point.id ||
              (point.kind === 'attraction' &&
                snapshot.points[point.id]?.availability === 'closed'))
            "
            class="pin-name"
            >{{ currentTerminalId === point.id ? "我在这里" : selected === point.id ? point.name : "未开放"
            }}<small
              v-if="
                selected === point.id &&
                snapshot.points[point.id]?.availability === 'closed'
              "
              >未开放</small
            ></component
          >
        </button>
      </template>
      <template v-if="viewMode==='crowd' && showRegionLabels">
        <template v-for="region in regions" :key="region.id">
          <LiquidGlassSurface as="span" :tint-opacity="0.09" v-if="projected[`region-${region.id}`]?.visible" class="region-count" :data-region-id="region.id"
            :style="{transform:`translate3d(${projected[`region-${region.id}`].x}px,${projected[`region-${region.id}`].y}px,0) translate(-50%,-50%)`}">
            <strong>{{region.name}}</strong><span>{{regionLabel(region.id)}}</span>
          </LiquidGlassSurface>
        </template>
      </template>
      <template v-if="route?.ok"
        ><span
          v-for="[id, label] in [
            [route.origin, '起'],
            [route.destination, '终'],
          ]"
          :key="label"
          class="route-end"
          :style="{
            transform: `translate3d(${projected[id]?.x ?? -100}px, ${(projected[id]?.y ?? -100)+39}px, 0) translate(-50%, -50%)`,
          }"
          >{{ label }}</span
        ></template
      >
    </div>
    <ScenicBubble v-if="chromeVisible && showDetails && selectedPoint" :anchor="projected[selectedPoint.id]" :title="selectedPoint.name" :eyebrow="kindLabels[selectedPoint.kind]" @close="emit('close')">
      <slot name="detail" :point="selectedPoint" :snapshot="snapshot">
        <ScenicPointInfo :point="selectedPoint" :snapshot="snapshot" @route="emit('route', $event)" @return="emit('return')"/>
      </slot>
    </ScenicBubble>
    <slot :projected="projected"/>
  </ScrollPresentation>
</template>

<style scoped>
.scene-shell,
.scene-canvas {
  width: 100%;
  height: 100%;
  position: relative;
}
.scene-canvas canvas {
  display: block;
  touch-action: none;
  width: 100%;
  height: 100%;
}
.map-markers {
  opacity:1;transition:opacity .6s;
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.map-pin {
  position: absolute;
  left:0;top:0;will-change:transform;
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  padding: 0;
  z-index: 2;
}
.pin-disc {
  height: var(--pin-diameter);
  width: var(--pin-diameter);
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: white;
  background: var(--state);
  border: 3px solid #f8fcfa;
  box-shadow: 0 3px 12px #1c443638;
}
.is-small .pin-disc {
  border-width: 2px;
}
.is-small {
  z-index: 1;
}
.is-selected {
  z-index: 4;
}
.is-selected .pin-disc {
  outline: 3px solid #255d78;
  outline-offset: 4px;
}
.pin-name {
  position: absolute;
  bottom: 57px;
  left: 50%;
  transform: translateX(-50%);
  min-width: max-content;
  max-width: 260px;
  padding: 10px 14px;
  font-size: 16px;
  display: flex;
  gap: 9px;
  align-items: center;
}
.pin-name:not(.is-closed-label) {background:#f8fcfaf5;border:1px solid #fff;border-radius:10px;box-shadow:0 4px 20px #193b3518;}
.pin-name small {
  font-size: 12px;
  color: var(--muted);
}
.route-end {
  position: absolute;
  left:0;top:0;will-change:transform;
  transform: translate(-50%, -50%);
  border: 2px solid white;
  border-radius: 50%;
  background: var(--blue);
  color: white;
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 600;
}

.scene-shell {--pin-diameter:36px;color:#193b35;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;--muted:#536b63;--blue:#255d78;--state:#616d6a;}
.map-pin {box-sizing:border-box;min-width:56px;min-height:56px;cursor:pointer;font:inherit;color:inherit;}
.map-pin:focus-visible {outline:3px solid #175f54;outline-offset:4px;border-radius:12px;}
.map-pin.quiet {--state:#83cbb6;}.map-pin.light {--state:#3869a1;}.map-pin.moderate {--state:#f0b65b;}.map-pin.busy {--state:#b33f36;}.map-pin.unknown {--state:#616d6a;}
.map-pin.category .pin-disc {background:#255d78;}
.map-pin:not(.is-selected) .pin-disc {opacity:.93;}
.pin-disc {position:relative;box-sizing:border-box;}
.pin-closed-badge {position:absolute;right:-5px;bottom:-5px;display:grid;place-items:center;width:16px;height:16px;border:1px solid white;border-radius:50%;background:#596a65;color:white;}
.map-pin.label-below .pin-name {top:57px;bottom:auto;}
.map-fallback {position:absolute;top:40%;left:50%;transform:translateX(-50%);max-width:90%;padding:24px;border-radius:20px;background:#f8fcfa;}
@media(min-width:1600px){.pin-name{font-size:20px;}}
@media(max-width:900px){.pin-name{font-size:14px;max-width:180px;}}
</style>

<style scoped>
.pin-body {display:flex;align-items:center;flex-shrink:0;}
.map-pin.is-current-terminal {z-index:5;width:max-content;min-width:56px;min-height:56px;height:56px;padding:0;border:0;background:transparent;color:white;}
.map-pin.is-current-terminal .pin-body {height:var(--pin-diameter);box-sizing:border-box;padding:0 12px 0 0;gap:3px;border-radius:999px;background:#175f54;box-shadow:0 3px 14px #193b3533;}
.map-pin.is-current-terminal .pin-disc {width:var(--pin-diameter);height:var(--pin-diameter);flex-shrink:0;border:0;outline:0;background:transparent;box-shadow:none;opacity:1;}
.current-terminal-label {white-space:nowrap;font-size:15px;font-weight:600;padding-right:2px;}
.map-pin.is-current-terminal.is-selected .pin-body {outline:3px solid #255d78;outline-offset:3px;}
.region-count {position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 10px;color:#193b35;font-size:14px;white-space:nowrap;pointer-events:none;}
.region-count strong{font-size:12px;font-weight:500;}.region-count span{font-weight:650;font-variant-numeric:tabular-nums;}
.map-markers.intro-hidden{opacity:0;}
@media(prefers-reduced-motion:reduce){.map-markers{transition:none;}}
</style>
