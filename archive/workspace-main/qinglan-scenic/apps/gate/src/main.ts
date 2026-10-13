import { installScrollbars } from "@scenic/ui/scrollbar";
import { createApp } from "vue";
import "@scenic/ui/theme.css";
import "./style.css";
import App from "./App.vue";
import logoUrl from "@scenic/ui/scenic-art/assets/logo.svg?url";
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = logoUrl;
document.head.append(favicon);
createApp(App).mount("#app");

const disposeScrollbars = installScrollbars();
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbars);
