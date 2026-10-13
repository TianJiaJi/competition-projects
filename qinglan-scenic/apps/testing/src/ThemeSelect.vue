<script setup lang="ts" generic="T extends string | number">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';
const props=defineProps<{modelValue:T;options:ReadonlyArray<{value:T;label:string}>;label:string;id?:string;disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:T]}>();
const generatedId=useId(),root=ref<HTMLElement|null>(null),trigger=ref<HTMLButtonElement|null>(null);
const open=ref(false),active=ref(0),upward=ref(false);
const triggerId=computed(()=>props.id || `select-${generatedId}`),menuId=computed(()=>`${triggerId.value}-menu`);
const selected=computed(()=>props.options.findIndex(option=>option.value===props.modelValue));
function close(){open.value=false;}
function show(){
  if(props.disabled || !props.options.length)return;
  active.value=Math.max(0,selected.value);
  const box=trigger.value?.getBoundingClientRect();
  let top=0,bottom=innerHeight;
  for(let parent=root.value?.parentElement;parent;parent=parent.parentElement){
    if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)){
      const bounds=parent.getBoundingClientRect();top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);
    }
  }
  const footer=root.value?.closest('form')?.querySelector<HTMLElement>('[data-select-obstacle]');
  if(footer){const bounds=footer.getBoundingClientRect();if(box && bounds.top>=box.bottom)bottom=Math.min(bottom,bounds.top-14);}
  const height=props.options.length*34+18;
  upward.value=!!box && bottom-box.bottom<height && box.top-top>bottom-box.bottom;
  open.value=true;
}
function choose(index:number){const option=props.options[index];if(props.disabled || !option)return;emit('update:modelValue',option.value);close();trigger.value?.focus();}
function outside(event:PointerEvent){if(event.target instanceof Node && !root.value?.contains(event.target))close();}
function keydown(event:KeyboardEvent){
  if(props.disabled)return;
  if(event.key==='Tab'){close();return;}
  if(event.key==='Escape'){if(open.value){event.preventDefault();event.stopPropagation();close();}return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();if(!open.value){show();if(event.key==='Home')active.value=0;else if(event.key==='End')active.value=props.options.length-1;return;}
    const count=props.options.length;if(!count)return;
    active.value=event.key==='Home'?0:event.key==='End'?count-1:(active.value+(event.key==='ArrowDown'?1:-1)+count)%count;
  }else if(event.key==='Enter' || event.key===' '){event.preventDefault();if(open.value)choose(active.value);else show();}
}
watch(()=>props.disabled,value=>{if(value)close();});
onMounted(()=>document.addEventListener('pointerdown',outside));
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<template>
  <div ref="root" class="theme-select" :class="{open,upward}">
    <button ref="trigger" :id="triggerId" type="button" class="select-trigger" role="combobox" :aria-label="label" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="menuId" :aria-activedescendant="open?`${menuId}-${active}`:undefined" :disabled="disabled" @click="open?close():show()" @keydown="keydown"><span>{{options[selected]?.label || '请选择'}}</span><ChevronDown :size="14"/></button>
    <div v-if="open" :id="menuId" class="select-menu" role="listbox" :aria-label="`${label}选项`"><button v-for="(option,index) in options" :key="option.value" :id="`${menuId}-${index}`" type="button" role="option" tabindex="-1" class="select-option" :class="{selected:index===selected,highlighted:index===active}" :aria-selected="index===selected" @pointermove="active=index" @pointerdown.prevent @click="choose(index)"><span>{{option.label}}</span><Check v-if="index===selected" :size="13"/></button></div>
  </div>
</template>
<style scoped>
.theme-select { position:relative; width:100%; margin-bottom:7px; min-width:0; }
.select-trigger { display:flex; align-items:center; justify-content:space-between; gap:9px; width:100%; min-height:36px; padding:9px 11px; border:1px solid #dce5d8; border-radius:8px; background:#fff; color:#355b40; font-size:11px; text-align:left; transition:border-color .15s,box-shadow .15s; }
.select-trigger:hover:not(:disabled) { border-color:#a6bea0; background:#fbfdf8; }
.select-trigger:focus-visible,.open .select-trigger { outline:none; border-color:#7fa075; box-shadow:0 0 0 3px #dce9d5; }
.select-trigger svg { color:#78946a; transition:transform .15s; }.open .select-trigger svg { transform:rotate(180deg); }
.select-trigger > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.select-menu { position:absolute; inset:calc(100% + 6px) 0 auto; z-index:50; padding:5px; border:1px solid #d7e3ce; border-radius:9px; background:#fff; box-shadow:0 8px 24px #3156401a; }
.upward .select-menu { top:auto; bottom:calc(100% + 6px); }
.select-option { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; min-height:34px; padding:8px 10px; border-radius:5px; color:#6a805d; font-size:11px; text-align:left; }
.select-option.selected { background:#edf4e5; color:#356745; font-weight:500; }
.select-option.highlighted { background:#e4eedb; color:#25634f; }
@media(prefers-reduced-motion:reduce) { .select-trigger,.select-trigger svg { transition:none; } }
</style>
