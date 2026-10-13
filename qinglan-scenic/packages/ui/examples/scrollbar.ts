import { createApp } from 'vue';
import Demo from './ScrollbarDemo.vue';
import { installScrollbars } from '../src/scrollbar/controller';
createApp(Demo).mount('#app');
const dispose = installScrollbars();
if (import.meta.hot) import.meta.hot.dispose(dispose);
