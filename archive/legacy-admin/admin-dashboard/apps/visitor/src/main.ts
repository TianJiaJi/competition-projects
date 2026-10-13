import { installScrollbars } from "@scenic/ui/scrollbar";
import { createApp } from "vue";
import App from "./App.vue";
import "@scenic/ui/theme.css";
import "./style.css";
import { installTouchInteractions } from "./touch-interactions";
const removeTouchInteractions = installTouchInteractions();
if (import.meta.hot) import.meta.hot.dispose(removeTouchInteractions);
createApp(App).mount("#app");

const disposeScrollbars = installScrollbars();
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbars);
