import { computed, ref, watch } from "vue";
import { scenario } from "../../../scenario/config";
const isOps = __TERMINAL__ === "ops";
export const dark = ref(isOps);
function lighten(hex: string) {
  return (
    "#" +
    hex
      .slice(1)
      .match(/.{2}/g)!
      .map((value) =>
        Math.round(parseInt(value, 16) * 0.42 + 255 * 0.58)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const brandColor = computed(() =>
  dark.value
    ? isOps
      ? scenario.screens.darkTheme.brand
      : lighten(scenario.theme.brand)
    : scenario.theme.brand,
);
export const themeColors = computed(() => {
  const t = scenario.theme;
  const vars: Record<string, string> = {
    brand: brandColor.value,
    "brand-solid": t.brand,
    accent: t.accent,
    canvas: dark.value ? t.dark : t.canvas,
    surface: dark.value ? "#2b3037" : t.surface,
    ink: dark.value ? "#f3f0ea" : t.ink,
    muted: dark.value ? "#babfc7" : t.muted,
    line: dark.value ? "#4a4d52" : t.line,
  };
  if (isOps && dark.value)
    Object.assign(vars, scenario.screens.darkTheme, {
      accent: scenario.screens.darkTheme.brand,
    });
  return vars;
});
export function applyTheme() {
  const t = scenario.theme;
  const vars = themeColors.value;
  for (const [key, value] of Object.entries(vars))
    document.documentElement.style.setProperty("--" + key, value);
  document.documentElement.dataset.theme = dark.value ? "dark" : "light";
  document.documentElement.style.colorScheme = dark.value ? "dark" : "light";
  const rgb = t.brand
    .match(/\w\w/g)!
    .map((x) => parseInt(x, 16))
    .join(" ");
  document.documentElement.style.setProperty("--brand-rgb", rgb);
  document.documentElement.style.setProperty(
    "--glass-tint-rgb",
    isOps
      ? (dark.value ? scenario.screens.darkTheme.surface : t.surface)
          .slice(1)
          .match(/.{2}/g)!
          .map((x) => parseInt(x, 16))
          .join(" ")
      : dark.value
        ? "45 48 54"
        : "255 252 247",
  );
  document.documentElement.style.setProperty("--glass-text-color", vars.ink);
  if (isOps) {
    const rgb = vars.brand
      .slice(1)
      .match(/.{2}/g)!
      .map((x) => parseInt(x, 16))
      .join(" ");
    for (const [key, alpha] of Object.entries({
      border: 0.22,
      "border-bottom": 0.1,
      "highlight-start": 0.09,
      "highlight-middle": 0.015,
      "highlight-end": 0.04,
    }))
      document.documentElement.style.setProperty(
        "--glass-" + key,
        `rgb(${rgb} / ${alpha})`,
      );
  }
  document.title = scenario.name;
}
watch(dark, applyTheme);
