import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],server:{port:5178,strictPort:true,proxy:{'/api':(process.env.SCENIC_API_TARGET || 'http://127.0.0.1:8787'),'/ws':{target:(process.env.SCENIC_API_TARGET || 'http://127.0.0.1:8787'),ws:true}}}});
