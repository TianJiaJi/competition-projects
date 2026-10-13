import {onMounted,onBeforeUnmount} from 'vue';
import {unsavedSummary} from './state';
export function useLiveRefresh(load:()=>unknown){const refresh=()=>{if(!unsavedSummary())void load();};onMounted(()=>window.addEventListener('admin-data-updated',refresh));onBeforeUnmount(()=>window.removeEventListener('admin-data-updated',refresh));}
