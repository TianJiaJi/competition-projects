import { reactive } from "vue";
import source from "../../../packages/scenic/generated/mobile.json";
import {emptySnapshot} from '../../../packages/contracts/src/empty-snapshot';
const data = reactive({...source,snapshot:emptySnapshot(source.points.map(p=>p.id),Array.from({length:9},(_,i)=>'Z'+i))});
export default data;
export const pointById = Object.fromEntries(
  data.points.map((point) => [point.id, point]),
);
export type Point = (typeof data.points)[number];
export type Route = (typeof data.routes)[number];
