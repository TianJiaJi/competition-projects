import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { scenario } from '../../scenario/config';
export default defineConfig({base:'./',plugins:[vue()],define:{__TERMINAL__:JSON.stringify('ops')},server:{port:scenario.ports.ops,strictPort:true},build:{chunkSizeWarningLimit:1500}});
