import { reactive } from "vue";
import { createState } from "@scene/domain";
import { scenario } from "../../../scenario/config";
export { scenario };
export const state = reactive(createState(scenario));
export const themeStyle = Object.entries(scenario.theme)
  .map(([k, v]) => `--${k}:${v}`)
  .join(";");
export const selection = reactive({ collection: "facilities", id: "" });
