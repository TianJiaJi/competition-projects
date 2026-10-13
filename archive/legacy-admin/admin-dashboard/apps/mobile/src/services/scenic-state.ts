import {emptySnapshot} from "../../../../packages/contracts/src/empty-snapshot";
import { reactive, onUnmounted } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import { request } from "./qa";
import data from "../data";
import { runtime, refreshProfile } from "./platform";
import { state } from "../model/store";
import type { ScenicState } from "../../../../packages/contracts/src/mobile-qa";
export const scenicStatus = reactive({
  loading: false,
  error: "",
  ready: false,
  runId: "",
  value: null as ScenicState | null,
});
let pending: Promise<boolean> | null = null;
function apply(value: ScenicState) {
  scenicStatus.value = value;
  scenicStatus.runId = state.aiRunId;
  scenicStatus.ready = true;
  scenicStatus.error = "";
  state.closedPoints = Object.entries(value.points)
    .filter(([, p]) => p.availability !== "open")
    .map(([id]) => id);
  state.closedEdges = [...value.closedEdgeIds];
  state.pointLoads = value.points;
}
export function refreshScenicState(): Promise<boolean> {
  if (pending) return pending;
  scenicStatus.loading = true;
  scenicStatus.ready = false;
  pending = (async () => {
    try {
      await runtime();
      const runId = state.aiRunId;
      const response = await request<any>("/public/state");
      const value = response.public as ScenicState;
      if(runId!==state.aiRunId||response.run.id!==runId)return false;
      Object.assign(data.snapshot,response.public);
      apply(value);
      if(state.aiSession)await refreshProfile();
      return true;
    } catch {
      scenicStatus.value=null;
      Object.assign(data.snapshot,emptySnapshot(data.points.map(p=>p.id),Array.from({length:9},(_,i)=>'Z'+i)));
      state.pointLoads={};state.closedPoints=data.points.map(p=>p.id);
      scenicStatus.error = "景区状态暂时无法更新，请重试。";
      if (state.tour?.status === "running") state.tour.status = "paused";
      return false;
    } finally {
      scenicStatus.loading = false;
      pending = null;
    }
  })();
  return pending;
}
export async function changeScenicState(input: Record<string, unknown>) {
  try {
    await runtime();
    apply(await request<ScenicState>("/debug/scenic/state", "POST", input));
  } catch {
    scenicStatus.ready = false;
    scenicStatus.error = "状态修改失败，请重试。";
  }
}
export function useScenicState(poll = false) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  onShow(() => {
    void refreshScenicState();
    if (true) {
      stop();
      timer = setInterval(() => void refreshScenicState(), 2000);
    }
  });
  onHide(stop);
  onUnmounted(stop);
  return scenicStatus;
}

let liveSocket: UniApp.SocketTask | undefined;
let liveHeartbeat: ReturnType<typeof setInterval> | undefined;
export function startScenicConnection(){
 if(liveSocket)return;
 let url='';
 // #ifdef H5
 url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws?app=mobile';
 // #endif
 // #ifdef MP-WEIXIN
 url=(import.meta.env.VITE_API_BASE_URL||'http://127.0.0.1:8787').replace(/^http/,'ws')+'/ws?app=mobile';
 // #endif
 liveSocket=uni.connectSocket({url,complete:()=>{}});
 liveSocket.onOpen(()=>{void refreshScenicState();liveHeartbeat=setInterval(()=>liveSocket?.send({data:'ping'}),5000);});
 liveSocket.onMessage(event=>{try{const value=JSON.parse(String(event.data));if(value.type==='invalidate')void refreshScenicState();}catch{}});
 liveSocket.onClose(()=>{clearInterval(liveHeartbeat);liveSocket=undefined;setTimeout(startScenicConnection,2000);});
}
