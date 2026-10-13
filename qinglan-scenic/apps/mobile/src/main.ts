// #ifdef H5
import { installScrollbars } from "../../../packages/ui/src/scrollbar/controller";
// #endif
import { createSSRApp } from "vue";
import App from "./App.vue";
export function createApp() {
  const app = createSSRApp(App);
  // #ifdef H5
  app.mixin({ mounted() { startScrollbars(); } });
  // #endif
  return { app };
}

// #ifdef H5
let disposeScrollbars: (() => void) | undefined;
function startScrollbars() {
  if (!disposeScrollbars) disposeScrollbars = installScrollbars();
}
if (import.meta.hot) import.meta.hot.dispose(() => disposeScrollbars?.());
// #endif
