/** Restored from the numerical-design discussion; physical capacities are shared. */
export const restroomCapacities={
  large:{female:24,male:8,maleUrinals:12,accessible:2},
  small:{female:16,male:6,maleUrinals:8,accessible:2},
} as const;
export const restroomDefinitions=[
  {id:'t1',size:'large',lunchMax:1},
  {id:'t2',size:'small',lunchMax:1},
  {id:'t3',size:'small',lunchMax:1},
  {id:'t4',size:'large',lunchMax:1.3},
  {id:'t5',size:'large',lunchMax:1.3},
  {id:'t6',size:'small',lunchMax:1.1},
] as const;
export const restroomCoverage:Record<string,Record<string,number>>={
  Z0:{t1:.8,t2:.2},Z1:{t2:.8,t1:.2},Z2:{t2:.6,t3:.4},Z3:{t3:.8,t4:.2},
  Z4:{t4:.85,t3:.15},Z5:{t5:.8,t6:.2},Z6:{t6:.8,t5:.2},Z7:{t6:.6,t3:.4},
  Z8:Object.fromEntries(restroomDefinitions.map(r=>[r.id,1/6])),
};
