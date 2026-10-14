/** Presentation timing only: the accelerated throughput is reduced by 8% twice
 * (each round lengthens durations by dividing by 0.92).
 * Brief simulated stalls are included in that total budget, not added on top. */
export function apiDisplayTiming(count:number):{delayMs:number;stalled:boolean}[]{
 if(!Number.isSafeInteger(count) || count<=0)return [];
 const budget=Math.round(count*25/1.2/0.92/0.92);
 const stops=count>=20 ? new Set([.25,.6,.85].map(r=>Math.min(count-1,Math.floor(count*r)))) : new Set<number>();
 const pause=Math.min(240,Math.floor(budget/9));
 const remaining=budget-stops.size*pause;
 const base=Math.floor(remaining/count),extra=remaining%count;
 return Array.from({length:count},(_,index)=>({delayMs:base+(index<extra?1:0)+(stops.has(index)?pause:0),stalled:stops.has(index)}));
}
