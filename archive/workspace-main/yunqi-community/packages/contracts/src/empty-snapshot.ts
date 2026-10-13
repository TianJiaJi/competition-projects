import type {PublicSnapshot} from './index.ts';
/** Shape-only initial state. Null means unavailable, never a simulated zero reading. */
export function emptySnapshot(pointIds:string[],regionIds:string[]):PublicSnapshot{
 return {revision:0,updatedAt:new Date(0).toISOString(),parkOpen:false,visitors:null,parkingFree:null,
  weather:{label:'—',temperature:null,humidity:null,wind:'—',aqi:null,ions:null},
  points:Object.fromEntries(pointIds.map(id=>[id,{availability:'unknown',load:'unknown'}])),
  regions:Object.fromEntries(regionIds.map(id=>[id,{availability:'unknown',load:'unknown',count:null}])),
  closedEdgeIds:[],announcements:[],visitorFlow:[]};
}
