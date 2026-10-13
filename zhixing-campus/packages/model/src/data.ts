import { roadPath, polylineLength, stairFlightPath, terrainHeight, mountainHeight, walkableStairPath } from "./geometry";
import { junctionConnection } from "./junctions";
import { siteById } from "./places";
import { plazaPointPositions,splitPathAtEntryPlaza } from "./plaza";
import { parkingById } from './parking';
import type {
  RoadNode,
  RoadEdge,
  ScenicPoint,
  Region,
} from "@scene/contracts";
import { visitorFixtures, safetyLabels } from './visitor-points';
export const scenicName = "青岚山境";
export const nodes: RoadNode[] = [
  ["entry", 0, 22],
  ["r1", 14, 15],
  ["r2", 17, 6],
  ["r3", 15, -5],
  ["r4", 3, -12],
  ["r5", -11, -14],
  ["r6", -17, 1],
  ["r7", -13, 14],
  ["creek", 21, 18],
  ["bamboo", 23, 3],
  ["gorge", 20, -8],
  ["summit", 4, -21],
  ["falls", -11, -17],
  ["lake", -17, 3],
  ["forest", -21, 10],
  ["market", -9, 20],
  ["supply", 21, -1],
  ["upper", -2, -20],
  ["lower", -13, 18],
  ["gate-out", -4, 23],
  ["t1", 4, 21],
  ["t2", 25, 16],
  ["t3", 19, -4],
  ["t4", 8, -21],
  ["t5", -19, -3],
  ["t6", -16, 9],
  ["p1", -10, 28],
  ["p2", 8, 28],
  ["p3", -19, 24],
  ["bamboo-court", 21.5, 5.5],
].map(([id, x, z]) => ({ id: String(id), ...(siteById[String(id)]?.entrance??parkingById[String(id)]?.entrance??plazaPointPositions[String(id)]??{x:Number(x),z:Number(z)}) }));
nodes.push(...visitorFixtures.map(({id,x,z})=>({id,x,z})));
const pairs: [string, string][] = [
  ["entry", "r1"],
  ["r1", "r2"],
  ["r2", "r3"],
  ["r3", "r4"],
  ["r4", "r5"],
  ["r5", "r6"],
  ["r6", "r7"],
  ["r7", "entry"],
  ["r1", "creek"],
  ["r2", "bamboo-court"],
  ["r3", "gorge"],
  ["r4", "summit"],
  ["r5", "falls"],
  ["r6", "lake"],
  ["r7", "forest"],
  ["r7", "market"],
  ["market", "gate-out"],
  ["gate-out", "entry"],
  ["bamboo-court", "supply"],
  ["summit", "upper"],
  ["lower", "market"],
  ["entry", "t1"],
  ["r1", "t2"],
  ["r3", "t3"],
  ["summit", "t4"],
  ["r6", "t5"],
  ["r7", "t6"],
  ["gate-out", "p1"],
  ["entry", "p2"],
  ["gate-out", "p3"],
  ["bamboo-court", "bamboo"],
];
export const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
const bends: Record<number, number[][]> = {
  0:[[4,22],[9,20]], 1:[[15,12],[16,9]],
  2:[[22,4],[22,0],[16,0],[13,-3]],
  3:[[13,-9],[8,-9],[8,-11]],
  4:[[0,-10],[-3,-10],[-10,-10]], 5:[[-16,-5],[-18,-2]],
  6:[[-18,5],[-16,9]], 7:[[-10,16],[-6,18],[-3,20]],
  8:[[17,18]],22:[[18,16],[22,16]],
  11:[[-.5,-13.5],[5.8,-15],[5.8,-17.5]],12:[[-15,-10],[-16,-14]],
  19:[[1,-20]],24:[[6,-21]],
  14:[[-17,15],[-21,13]], 15:[[-12,17]],18:[[23,5],[24,0]],
};
// Hand-composed paths keep the two mountain journeys within comfortable stair grades.
// Road-4 crosses the stream on a level deck between its two bank platforms.
const walkingProfiles:Record<number,number[][]>={
  0:[[10,18,.81]],7:[[-8,18,.81]],15:[[-12.65,18,.81]],16:[],17:[],20:[],21:[],27:[],28:[],29:[],
  2:[[21,3,2.52],[21,-1,4.14],[15,0,6.01]],
  3:[[16,-12,7.3],[11,-12,9],[11,-5,11.16],[7.5,-5,12.42],[7.5,-10.5,14.46]],
  4:[[3,-6.2,14.46],[-1.2,-6.2,13.56],[-1.2,-12.5,11.21],[-10,-12.5,11.21]],
  5:[[-16,-12,9.18],[-12.5,-9,7.56],[-18,-6,5.58],[-14,-3,3.96]],
  10:[[24,-7,8.3],[23,-11,9.91]],
  11:[[10,-12,16.02],[10,-16,17.64],[0,-16,21.6],[0,-18.4,22.26]],
  6:[[-20,4,1.98],[-19,9,1.44]],
  9:[[20,6,1.46]],13:[],18:[[22.2,3.5,1.46]],26:[[-13.8,11.5,1.44],[-15.8,10,1.46]],30:[],
  12:[],23:[],19:[[1,-20,22.26]],24:[],
};
// Explicit landings and compact access paths belong to the shared road geometry.
export const stairLandings:Record<string,{x:number;y:number;z:number}[]>={};
export const edges: RoadEdge[] = pairs.map(([from,to],i)=>{
  const a=nodeById[from],b=nodeById[to];
  const anchors=[[a.x,a.z],...(bends[i]??[]),[b.x,b.z]];
  const composed=i===3||i in walkingProfiles;
  let profile=anchors.map(([x,z],j)=>({x,z,y:j===0||j===anchors.length-1?terrainHeight(x,z)+.16:Math.round((mountainHeight(x,z)+.24)/.18)*.18}));
  if(i in walkingProfiles)profile=[profile[0],...walkingProfiles[i].map(([x,z,y])=>({x,y,z})),profile.at(-1)!];
  if(composed)stairLandings[`road-${i}`]=profile.slice(1,-1);
  const start=junctionConnection(from,`road-${i}`),end=junctionConnection(to,`road-${i}`);
  // Finish each stair flight outside the collar, then enter along a level straight landing.
  const approach=(connection:NonNullable<typeof start>)=>({x:connection.outer.x+connection.dx*.5,z:connection.outer.z+connection.dz*.5,y:connection.outer.y});
  const bodyProfile=[start?approach(start):profile[0],...profile.slice(1,-1),end?approach(end):profile.at(-1)!];
  const body=i in walkingProfiles?walkableStairPath(bodyProfile):composed?stairFlightPath(bodyProfile):roadPath(anchors,i===1);
  const path=splitPathAtEntryPlaza([...(start?[profile[0],start.gate,start.outer]:[]),...body,...(end?[end.outer,end.gate,profile.at(-1)!]:[])]);
  return {id:`road-${i}`,from,to,mode:'walk',path,length:Math.round(polylineLength(path)),...(i===1?{structure:'bridge' as const}:{})};
});
for(const fixture of visitorFixtures){
  const a=nodeById[fixture.connectTo],b=nodeById[fixture.id];
  const path=splitPathAtEntryPlaza(walkableStairPath([a,b].map(n=>({x:n.x,z:n.z,y:terrainHeight(n.x,n.z)+.16}))));
  edges.push({id:`access-${fixture.id}`,from:a.id,to:b.id,mode:'walk',path,length:Math.round(polylineLength(path))});
}
edges.push({
  id: "cable-down",
  from: "upper",
  to: "lower",
  length: 1540,
  mode: "cable",
  directed: true,
});
export const regions: Region[] = [
  { id: "Z0", name: "入口服务区", x: 0, z: 21, radius: 10, capacity: 1000 },
  { id: "Z1", name: "溪谷区", x: 19, z: 14, radius: 7, capacity: 1100 },
  { id: "Z2", name: "竹林区", x: 21, z: 3, radius: 7, capacity: 1100 },
  { id: "Z3", name: "峡谷观景区", x: 18, z: -6, radius: 7, capacity: 1000 },
  { id: "Z4", name: "山顶观景区", x: 4, z: -15, radius: 10, capacity: 1300 },
  { id: "Z5", name: "湖畔游览区", x: -20, z: 0, radius: 7, capacity: 1300 },
  { id: "Z6", name: "林间休息区", x: -18, z: 10, radius: 7, capacity: 1000 },
  { id: "Z7", name: "瀑布游览区", x: -11, z: -17, radius: 7, capacity: 1000 },
  { id: "Z8", name: "公共通行区", x: 0, z: 1, radius: 10, capacity: 2500 },
];
const p = (
  id: string,
  name: string,
  kind: ScenicPoint["kind"],
  regionId: string,
  description: string,
  hours = "08:00—18:00",
  services?: string[],
): ScenicPoint => ({
  id,
  name,
  kind,
  nodeId: id,
  regionId,
  description,
  hours,
  services,
});
export const points: ScenicPoint[] = [
  ...visitorFixtures.map(f=>({...p(f.id,f.name,f.kind,f.regionId,
    f.kind==='terminal'?'在此查询景点、设施和路线。从这里出发，沿景区步道开启游览。':
    f.safetyKind==='help'?'现场一键求助设备的位置。本页面仅展示位置与状态，请前往现场设备使用。':
    `${safetyLabels[f.safetyKind!]}所在位置，请按现场标识及工作人员指引使用。`,
    '以现场开放安排为准',f.safetyKind?[safetyLabels[f.safetyKind]]:['游客导览']),safetyKind:f.safetyKind})),
  p(
    "entry",
    "景区入口",
    "entrance",
    "Z0",
    "从这里走进青岚山境。环形主路串联溪谷、竹林与山顶，沿途支路通往各处景观。",
    "08:00—17:00",
  ),
  p(
    "gate-out",
    "景区出口",
    "entrance",
    "Z0",
    "返程出口与入园口位于同一广场，附近设有商业区与停车场。",
  ),
  p(
    "creek",
    "听溪台",
    "attraction",
    "Z1",
    "临溪而筑的木台，能听见水流绕过青石的声音。沿支路缓行，可以近看溪谷与岸边植被。",
  ),
  p(
    "bamboo",
    "竹影幽径",
    "attraction",
    "Z2",
    "细密竹影落在石阶上，林间短径从主路向内延伸，适合停留片刻。",
  ),
  p(
    "gorge",
    "叠翠峡",
    "attraction",
    "Z3",
    "两侧层叠石壁夹出一线山色，观景台可眺望峡谷与远山。",
  ),
  p(
    "summit",
    "望岳台",
    "attraction",
    "Z4",
    "环线最高处，也是游览的最后一站。山峦与湖泊在此展开，可沿山路返程，或前往索道上站下山。",
  ),
  p(
    "falls",
    "飞瀑亭",
    "attraction",
    "Z7",
    "水流从高处山壁跌落，亭前可看飞瀑入潭。雨后石阶湿滑，请沿开放步道游览。",
  ),
  p(
    "lake",
    "镜湖栈道",
    "attraction",
    "Z5",
    "沿湖木栈道贴着岸线展开，水中倒映着青山与云影。",
  ),
  p(
    "forest",
    "松风林",
    "attraction",
    "Z6",
    "林间的缓坡与石凳适合歇脚，松风穿过树冠，是返程前的一处安静停留点。",
  ),
  p(
    "market",
    "归云集 · 出口商业区",
    "commercial",
    "Z0",
    "临近出口的山间小集，提供餐饮、文创和游客服务。返程可在此休息，再步行前往出口。",
    "09:00—19:00",
    ["餐饮", "文创", "游客服务"],
  ),
  p(
    "supply",
    "竹间驿 · 中途补给",
    "commercial",
    "Z2",
    "主路旁的小型补给与休息点，可补充饮水、购买简餐并稍作休息。",
    "09:00—17:30",
    ["饮水", "简餐", "休息"],
  ),
  p(
    "upper",
    "索道上站",
    "cable",
    "Z4",
    "从山顶乘索道下行，抵达出口商业区附近。",
    "08:00—18:30",
  ),
  p(
    "lower",
    "索道下站",
    "cable",
    "Z0",
    "下行到站后，沿步道前往归云集与景区出口。",
    "08:00—18:30",
  ),
  ...[
    ["t1", "入口卫生间", "Z0"],
    ["t2", "溪谷卫生间", "Z1"],
    ["t3", "峡谷卫生间", "Z3"],
    ["t4", "山顶卫生间", "Z4"],
    ["t5", "湖畔卫生间", "Z5"],
    ["t6", "林间卫生间", "Z6"],
  ].map(([id, name, region]) =>
    p(
      id,
      name,
      "toilet",
      region,
      "位于游览步道旁的公共卫生间，忙闲状态随景区数据更新。",
    ),
  ),
  p(
    "p1",
    "一号停车场",
    "parking",
    "Z0",
    "靠近出口广场的小客车停车场。",
    "07:00—19:30",
  ),
  p(
    "p2",
    "二号停车场",
    "parking",
    "Z0",
    "位于入园广场东侧的小客车停车场。",
    "07:00—19:30",
  ),
  p(
    "p3",
    "三号停车场",
    "parking",
    "Z0",
    "位于一号停车场西侧的小客车停车场。",
    "07:00—19:30",
  ),
];
export const pointById = Object.fromEntries(points.map((p) => [p.id, p]));
export const kindLabels = {
  attraction: "景点",
  toilet: "卫生间",
  terminal: "游客终端",
  safety: "安全设施",
  parking: "停车场",
  cable: "索道",
  commercial: "餐饮补给",
  entrance: "出入口",
};
export const loadLabels = {
  quiet: "空闲",
  light: "较舒适",
  moderate: "适中",
  busy: "拥堵",
  unknown: "数据未知",
};
export const availabilityLabels = {
  open: "开放中",
  closed: "未开放",
  maintenance: "维修中",
  unknown: "状态未知",
};
