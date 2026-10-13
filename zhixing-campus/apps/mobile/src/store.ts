import { reactive } from "vue";
import { createState } from "@scene/domain";
import { scenario } from "../../../scenario/config";
export { scenario };
const initialState = createState(scenario);
// Demo identity is local to this device; real deployments require server sessions.
initialState.identity = uni.getStorageSync("zhixing:student-session") === "林悦" ? "林悦" : null;
export const state = reactive(initialState);
export const themeStyle = Object.entries(scenario.theme)
  .map(([k, v]) => `--${k}:${v}`)
  .join(";");
export const selection = reactive({ collection: "facilities", id: "" });
