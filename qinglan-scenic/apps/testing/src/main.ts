import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import "./green-theme.css";
import "./ui-review-layout.css";

import { initializeServiceSession, checkServiceRestart } from './runtime-task';
void initializeServiceSession().then(()=>{
  createApp(App).mount('#app');
  const timer=window.setInterval(()=>void checkServiceRestart(),5000);
  const focused=()=>void checkServiceRestart();
  window.addEventListener('focus',focused);
  if(import.meta.hot)import.meta.hot.dispose(()=>{clearInterval(timer);window.removeEventListener('focus',focused);});
});
