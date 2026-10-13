// Sequential callbacks also work safely on a transaction's single connection.
export async function asyncmap<T,R>(items:readonly T[],fn:(item:T,index:number)=>Promise<R>):Promise<R[]>{const result:R[]=[];for(let i=0;i<items.length;i++)result.push(await fn(items[i],i));return result;}
export async function asyncflatMap<T,R>(items:readonly T[],fn:(item:T,index:number)=>Promise<R[]>):Promise<R[]>{return (await asyncmap(items,fn)).flat();}
export async function asyncforEach<T>(items:readonly T[],fn:(item:T,index:number)=>Promise<unknown>):Promise<void>{await asyncmap(items,fn);}
export async function asyncfilter<T>(items:readonly T[],fn:(item:T,index:number)=>Promise<boolean>):Promise<T[]>{const flags=await asyncmap(items,fn);return items.filter((_,i)=>flags[i]);}
