import { reactive } from "vue";
import { seed } from "./domain";
import type { LocalState } from "./types";
const key = "qinglan-mobile-platform-v2";
let initial = seed();
initial.orders = []; initial.messages = []; initial.nickname = ""; initial.aiSession = ""; initial.aiRunId = "";
let corrupt = false;
try {
  const saved = uni.getStorageSync(key);
  if (saved) {
    if (
      saved.version === 1 &&
      Array.isArray(saved.orders) &&
      Array.isArray(saved.messages) &&
      Array.isArray(saved.favourites) &&
      Array.isArray(saved.closedPoints) &&
      Array.isArray(saved.closedEdges)
    )
      initial = saved;
    else corrupt = true;
  }
} catch {
  corrupt = true;
}
// Legacy device closures are not authoritative after the server-state migration.
initial.orders=[];initial.messages=[];initial.tour=null;
initial.closedPoints = [];
initial.closedEdges = [];
initial.pointLoads = {};
export const state = reactive<LocalState>(initial);
export const storageStatus = reactive({ invalid: corrupt, error: "" });
export function save() {
  if (storageStatus.invalid)
    throw Error("设备记录无法读取，请前往调试工具重置。");
  try {
    uni.setStorageSync(key, JSON.parse(JSON.stringify(state)));
    storageStatus.error = "";
  } catch {
    storageStatus.error = "本地存储写入失败，刷新可能丢失刚才的操作。";
    throw Error(storageStatus.error);
  }
}
export function reset() {
  Object.assign(state, seed());
  storageStatus.invalid = false;
  save();
}
export function act(work: () => void) {
  const before = JSON.parse(JSON.stringify(state));
  try {
    work();
    save();
    return true;
  } catch (error) {
    Object.assign(state, before);
    uni.showToast({
      title: (error as Error).message,
      icon: "none",
      duration: 3000,
    });
    return false;
  }
}
export function go(path: string) {
  uni.navigateTo({ url: "/pages/" + path });
}
export function tab(name: string) {
  uni.switchTab({ url: "/pages/" + name + "/index" });
}
export async function toggleFavourite(id: string) {
  try { const {saveProfile} = await import('../services/platform');
    const next = state.favourites.includes(id) ? state.favourites.filter(v=>v!==id) : [...state.favourites,id];
    await saveProfile(next);
  } catch(e) { uni.showToast({title:(e as Error).message,icon:'none'}); }
}
