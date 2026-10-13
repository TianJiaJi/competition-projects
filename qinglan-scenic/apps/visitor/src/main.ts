import {installDesktopDisplay} from "@scenic/ui/display";
import { installScrollbars } from "@scenic/ui/scrollbar";
import { createApp } from "vue";
import App from "./App.vue";
import "@scenic/ui/theme.css";
import "./style.css";
import { installTouchInteractions } from "./touch-interactions";
const removeTouchInteractions = installTouchInteractions();
if (import.meta.hot) import.meta.hot.dispose(removeTouchInteractions);
const disposeDisplay=installDesktopDisplay();
if(import.meta.hot)import.meta.hot.dispose(disposeDisplay);
createApp(App).mount("#app");

const disposeScrollbars = installScrollbars();
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbars);
