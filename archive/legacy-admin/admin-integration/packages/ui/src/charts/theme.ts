export const chartColors = {
  brand: "#175f54",
  blue: "#255d78",
  green: "#3c826b",
  muted: "#536b63",
  grid: "#d4e2db",
  warning: "#a56d21",
  danger: "#b33f36",
};
export const chartText = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
  color: chartColors.muted,
  fontSize: 12,
};
export const chartGridLine = {
  lineStyle: { color: chartColors.grid, type: "dashed" as const },
};

export const darkChartColors = {
  brand: "#83CBB6", blue: "#69B7EA", green: "#83CBB6",
  muted: "#A3BBB5", grid: "#345052", warning: "#F0B65B", danger: "#F17B72",
};
/** Explicit palette selection keeps existing consumers on the light defaults. */
export function getChartTheme(mode: "dark" | "light") {
  const colors = mode === "dark" ? darkChartColors : chartColors;
  return {
    colors,
    text: { ...chartText, color: colors.muted },
    gridLine: { lineStyle: { color: colors.grid, type: "dashed" as const } },
    ink: mode === "dark" ? "#E7EFEB" : "#193b35",
    tooltip: {
      backgroundColor: mode === "dark" ? "#203A3C" : "#f8fcfa",
      borderColor: colors.grid,
      textStyle: { color: mode === "dark" ? "#E7EFEB" : "#193b35" },
    },
  };
}
