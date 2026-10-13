import {sampleSnapshot} from "../../packages/client/testing/snapshot";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectPublicClient,
  validateSnapshot,
} from "../../packages/client/src/index";
import type { ConnectionState, PublicSnapshot } from "@scenic/contracts";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("public client connection state", () => {
  it("does not apply the sample opening override to live data", async () => {
    vi.useFakeTimers();vi.stubGlobal('WebSocket',undefined);
    const closed=sampleSnapshot(new Date('2026-09-11T15:00:00Z')),onSnapshot=vi.fn();
    const stop=connectPublicClient({mode:'live',fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{run:{id:"test"},public:closed}}))),onState:()=>{},onSnapshot});
    await vi.advanceTimersByTimeAsync(0);
    expect(onSnapshot).toHaveBeenCalledWith(closed);expect(onSnapshot.mock.calls[0][0].parkOpen).toBe(false);
    stop();
  });
  it("never falls back to samples after a live failure, and recovers with a fresh snapshot", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", undefined);
    const states: ConnectionState[] = [],
      snapshots: PublicSnapshot[] = [],
      s = sampleSnapshot(new Date("2026-09-11T04:00:00Z"));
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async()=>new Response(JSON.stringify({data:{run:{id:"test"},public:s}})));
    const stop = connectPublicClient({
      mode: "live",
      fetcher,
      onState: (state) => states.push(state),
      onSnapshot: (value) => snapshots.push(value),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("disconnected");
    expect(snapshots).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15000);
    expect(states.at(-1)).toBe("connected");
    expect(snapshots.length).toBeGreaterThan(0);
    for(const snapshot of snapshots)expect(snapshot).toEqual(s);
    stop();
  });
  it("rejects malformed live data instead of presenting an empty or successful result", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", undefined);
    const states: ConnectionState[] = [],
      onSnapshot = vi.fn();
    const stop = connectPublicClient({
      mode: "live",
      fetcher: vi.fn().mockResolvedValue(new Response("{}")),
      onState: (s) => states.push(s),
      onSnapshot,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("disconnected");
    expect(onSnapshot).not.toHaveBeenCalled();
    stop();
  });
  it("stops live updates when the page is disposed", async () => {
    vi.useFakeTimers();vi.stubGlobal('WebSocket',undefined);
    const onSnapshot=vi.fn(),onState=vi.fn(),value=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
    const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({data:{run:{id:'test'},public:value}})));
    const stop=connectPublicClient({onSnapshot,onState,fetcher});
    await vi.advanceTimersByTimeAsync(0);expect(onSnapshot).toHaveBeenCalledTimes(1);stop();
    await vi.advanceTimersByTimeAsync(60000);expect(onSnapshot).toHaveBeenCalledTimes(1);
  });
});


describe('optional restroom telemetry',()=>{
  it('accepts missing metrics, unknown fields and real zero counts without inventing stalls',()=>{
    const s=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
    delete s.points.t1.restroom;expect(s.points.t1.restroom).toBeUndefined();expect(validateSnapshot(s)).toEqual(s);
    s.points.t1.restroom={totalStalls:12,occupiedStalls:9,availableStalls:0,queueCount:0};
    expect(validateSnapshot(s).points.t1.restroom).toEqual(s.points.t1.restroom);
    s.points.t1.restroom={totalStalls:null,occupiedStalls:null,availableStalls:null,queueCount:null};
    expect(validateSnapshot(s).points.t1.restroom?.availableStalls).toBeNull();
  });
  it.each([
    {totalStalls:8,occupiedStalls:6,availableStalls:3,queueCount:0},
    {totalStalls:8,occupiedStalls:9,availableStalls:null,queueCount:0},
    {totalStalls:8,occupiedStalls:null,availableStalls:9,queueCount:0},
    {totalStalls:8,occupiedStalls:0,availableStalls:8,queueCount:-1},
    {totalStalls:8.5,occupiedStalls:0,availableStalls:8,queueCount:0},
  ])('rejects inconsistent or non-integer restroom values: %j',restroom=>{
    const s=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));s.points.t1.restroom=restroom;
    expect(()=>validateSnapshot(s)).toThrow('卫生间坑位数据不正确');
  });
});


describe('restroom gender breakdown',()=>{
  it('preserves distinct male and female counts and supports a missing breakdown',()=>{
    const s=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
    s.points.t1.restroom={totalStalls:12,occupiedStalls:9,availableStalls:0,queueCount:3,
      male:{totalStalls:5,occupiedStalls:4,availableStalls:0,queueCount:0},
      female:{totalStalls:7,occupiedStalls:5,availableStalls:0,queueCount:3}};
    expect(validateSnapshot(s).points.t1.restroom?.male?.queueCount).toBe(0);
    delete s.points.t1.restroom.female;
    expect(validateSnapshot(s).points.t1.restroom?.female).toBeUndefined();
  });
  it('rejects impossible gender counts and subtotals exceeding the whole restroom',()=>{
    const s=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
    s.points.t1.restroom={totalStalls:12,occupiedStalls:9,availableStalls:0,queueCount:3,
      male:{totalStalls:5,occupiedStalls:6,availableStalls:0,queueCount:0}};
    expect(()=>validateSnapshot(s)).toThrow('卫生间坑位数据不正确');
    s.points.t1.restroom.male={totalStalls:13,occupiedStalls:6,availableStalls:0,queueCount:0};
    expect(()=>validateSnapshot(s)).toThrow('卫生间男女分项超过合计');
  });
});


it('restores documented capacities and keeps each service queue and occupancy consistent',()=>{
  const keys=['female','male','maleUrinals','accessible'] as const;
  for(const time of ['2026-09-11T01:03:00Z','2026-09-11T04:00:00Z','2026-09-11T07:15:00Z','2026-09-11T15:00:00Z']){
    const snapshot=sampleSnapshot(new Date(time));expect(validateSnapshot(snapshot)).toEqual(snapshot);
    for(const id of ['t1','t2','t3','t4','t5','t6']){
      const r=snapshot.points[id].restroom!,large=['t1','t4','t5'].includes(id);
      expect(r.totalStalls).toBe(large?46:32);
      expect(keys.map(key=>r[key]!.totalStalls)).toEqual(large?[24,8,12,2]:[16,6,8,2]);
      for(const key of keys){const part=r[key]!;expect(part.occupiedStalls!+part.availableStalls!).toBeLessThanOrEqual(part.totalStalls!);if(part.queueCount!>0)expect(part.availableStalls).toBe(0);}
      expect(r.occupiedStalls).toBe(keys.reduce((n,key)=>n+r[key]!.occupiedStalls!,0));
      if(snapshot.points[id].availability!=='open')expect(r.availableStalls).toBe(0);
    }
    expect(sampleSnapshot(new Date(time))).toEqual(snapshot);
  }
});
