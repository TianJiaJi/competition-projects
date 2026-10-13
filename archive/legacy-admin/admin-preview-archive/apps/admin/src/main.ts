import { createApp } from "vue";
import "@scenic/ui/theme.css";
import "./style.css";
import App from "./App.vue";

document.body.classList.add("admin-body");
createApp(App).mount("#app");
