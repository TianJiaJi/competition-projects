import { reactive } from "vue";
import { createState } from "@scene/domain";
import { scenario as baseScenario } from "../../../scenario/config";
import { schoolScenario } from "../../../packages/demo/src/samples/school/index";
import {
  parsePreview,
  createPreviewClient,
} from "../../../packages/demo/src/builder/client";
import type { Collection } from "@scene/domain";
// Native entry keeps the original local experience; browser-only APIs run only in H5.
export const preview = parsePreview(
  typeof location !== "undefined" ? location.search : "",
  "mobile",
);
export const scenario = preview.enabled ? schoolScenario() : baseScenario;
export const state = reactive(createState(scenario));
export const previewStatus = reactive({
  ready: false,
  error: preview.error || "",
  fatal: !!preview.error,
  updatedAt: "",
});
export let previewClient: ReturnType<typeof createPreviewClient> | undefined;
// #ifdef H5
if (preview.context) {
  if (preview.context.stage === "03")
    for (const c of Object.keys(state.records) as Collection[])
      state.records[c] = [];
  previewClient = createPreviewClient(
    preview.context,
    state,
    previewStatus,
    () => !!state.identity,
  );
}
// #endif
export const themeStyle = Object.entries(scenario.theme)
  .map(([k, v]) => `--${k}:${v}`)
  .join(";");
export const selection = reactive({ collection: "facilities", id: "" });
