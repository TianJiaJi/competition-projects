import { installScrollbars } from "@scenic/ui/scrollbar";
import { createApp } from "vue";
import "@scenic/ui/theme.css";
import "./style.css";
import "./theme.css";
import App from "./App.vue";
createApp(App).mount("#app");

const disposeScrollbars = installScrollbars();
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbars);
