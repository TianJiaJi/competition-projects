import {installDesktopDisplay} from "@scenic/ui/display";
import { installScrollbars } from "@scenic/ui/scrollbar";
import { createApp } from "vue";
import "@scenic/ui/theme.css";
import "./style.css";
import "./dark.css";
import App from "./App.vue";
import { initializeAdminTheme } from "./app/theme";

document.body.classList.add("admin-body");
const disposeTheme = initializeAdminTheme();
if (import.meta.hot) import.meta.hot.dispose(disposeTheme);
const disposeDisplay=installDesktopDisplay();
if(import.meta.hot)import.meta.hot.dispose(disposeDisplay);
createApp(App).mount("#app");

const disposeScrollbars = installScrollbars();
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbars);
