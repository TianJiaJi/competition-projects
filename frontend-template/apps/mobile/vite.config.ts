import {defineConfig} from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import {scenario} from '../../scenario/config';
const plugin=typeof uni==='function'?uni:(uni as any).default;
export default defineConfig({base:'./',plugins:[plugin()],server:{port:scenario.ports.mobile,strictPort:true}});
