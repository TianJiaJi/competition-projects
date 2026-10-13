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
      ? "#d4ab7e"
      : lighten(scenario.theme.brand)
    : scenario.theme.brand,
);
export const themeColors = computed(() => {
  const t = scenario.theme;
  return {
    brand: brandColor.value,
    "brand-solid": t.brand,
    accent: dark.value && isOps ? "#d4ab7e" : t.accent,
    canvas: dark.value ? (isOps ? "#29221e" : t.dark) : t.canvas,
    surface: dark.value ? (isOps ? "#3a2f28" : "#2b3037") : t.surface,
    ink: dark.value ? (isOps ? "#f4e9dc" : "#f3f0ea") : t.ink,
    muted: dark.value ? (isOps ? "#c3ad98" : "#babfc7") : t.muted,
    line: dark.value ? (isOps ? "#655040" : "#4a4d52") : t.line,
  };
});
export function applyTheme() {
  const vars = themeColors.value;
  for (const [key, value] of Object.entries(vars))
    document.documentElement.style.setProperty("--" + key, value);
  document.documentElement.dataset.theme = dark.value ? "dark" : "light";
  document.documentElement.style.colorScheme = dark.value ? "dark" : "light";
  const rgb = scenario.theme.brand
    .match(/\w\w/g)!
    .map((x) => parseInt(x, 16))
    .join(" ");
  document.documentElement.style.setProperty("--brand-rgb", rgb);
  document.documentElement.style.setProperty(
    "--glass-tint-rgb",
    dark.value ? (isOps ? "58 47 40" : "45 48 54") : "255 252 247",
  );
  document.documentElement.style.setProperty("--glass-text-color", vars.ink);
  if (isOps) {
    const style = document.documentElement.style;
    const warm = dark.value;
    style.setProperty(
      "--glass-border",
      warm ? "rgb(212 171 126 / .22)" : "rgb(149 97 72 / .2)",
    );
    style.setProperty(
      "--glass-border-bottom",
      warm ? "rgb(212 171 126 / .1)" : "rgb(149 97 72 / .1)",
    );
    style.setProperty(
      "--glass-highlight-start",
      warm ? "rgb(212 171 126 / .09)" : "rgb(255 255 255 / .22)",
    );
    style.setProperty(
      "--glass-highlight-middle",
      warm ? "rgb(212 171 126 / .015)" : "rgb(255 255 255 / .025)",
    );
    style.setProperty(
      "--glass-highlight-end",
      warm ? "rgb(212 171 126 / .04)" : "rgb(255 255 255 / .07)",
    );
  }
  document.title = scenario.name;
}
watch(dark, applyTheme);
