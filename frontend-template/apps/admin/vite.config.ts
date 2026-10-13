import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { scenario } from '../../scenario/config';
export default defineConfig({base:'./',plugins:[vue()],define:{__TERMINAL__:JSON.stringify('admin')},server:{port:scenario.ports.admin,strictPort:true},build:{chunkSizeWarningLimit:1500}});
