import { createApp } from "vue";
import App from "./App.vue";
import "@scene/ui/theme.css";
import "@scene/ui/scrollbar/scrollbar.css";
import "./style.css";
import "./teacher-workspace.css";
import { applyTheme } from "./theme";
applyTheme();
createApp(App).mount("#app");
