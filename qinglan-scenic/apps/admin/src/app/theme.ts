import { computed, ref } from "vue";

export type AdminAppearance = "system" | "light" | "dark";
const STORAGE_KEY = "qinglan.admin.appearance";
const system = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(system.matches);
function readPreference(): AdminAppearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}
export const appearance = ref<AdminAppearance>(readPreference());
export const adminTheme = computed(() => appearance.value === "system" ? (systemDark.value ? "dark" : "light") : appearance.value);

function apply() {
  const theme = adminTheme.value;
  document.body.dataset.theme = theme;
  document.documentElement.dataset.adminTheme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === "dark" ? "#101c1a" : "#f5f4ef";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101c1a" : "#f5f4ef");
}
export function setAppearance(value: AdminAppearance) {
  appearance.value = value;
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* The choice still applies to this tab when storage is unavailable. */ }
  apply();
}
export function initializeAdminTheme() {
  const onSystem = (event: MediaQueryListEvent) => { systemDark.value = event.matches; apply(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    appearance.value = readPreference(); apply();
  };
  apply();
  system.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => { system.removeEventListener("change", onSystem); window.removeEventListener("storage", onStorage); };
}
