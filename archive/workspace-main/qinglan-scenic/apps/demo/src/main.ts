import {installDesktopDisplay} from "@scenic/ui/display";
import {createApp} from 'vue';
import App from './App.vue';
import './style.css';
const disposeDisplay=installDesktopDisplay();
if(import.meta.hot)import.meta.hot.dispose(disposeDisplay);
createApp(App).mount('#app');
