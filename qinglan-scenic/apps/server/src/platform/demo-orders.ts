import {bookingSlots} from './schedules.ts';
import type {Booking} from '../../../../packages/contracts/src/platform.ts';
import type {Store} from './store.ts';
import {dateOf,hourOf} from './simulation.ts';

/** Explicit, repeatable demo seeding; never changes existing orders or checks anyone in. */
export async function seedDemoOrders(store:Store,runId:string,time:number){
 const date=dateOf(time),next=dateOf(time+86400000),previous=dateOf(time-86400000);
 const visitors=await store.db.query("SELECT id FROM accounts WHERE role='visitor' AND disabled=false AND username IN ('visitor01','visitor02','visitor03','visitor04','visitor05') ORDER BY id");
 let added=0;
 for(const [i,user] of visitors.rows.entries()){
  const slot=hourOf(time)<16?String(Math.max(8,Math.ceil(hourOf(time)))).padStart(2,'0')+':00':'09:00';
  const planned=hourOf(time)<16?date:next;
  const examples:Partial<Booking>[]=[
   {kind:'entry',date:planned,slot,people:1+i%3,status:'confirmed'},
   {kind:'parking',lotId:'p'+(i%3+1),date:next,slot:String(9+i).padStart(2,'0')+':00',people:1,status:'confirmed'},
   {kind:'entry',date:i%2?previous:next,slot:'10:00',people:2,status:i%2?'expired':'cancelled'},
  ];
  for(const [j,example] of examples.entries()){
   const id=`demo-order-${date}-${i}-${j}`;
   if(await store.get('orders',id,runId))continue;
   if(example.status==='confirmed'){
    const available=await bookingSlots(store,runId,time,example.date!,example.kind!,example.lotId);
    const target=available.find(s=>s.slot===example.slot&&s.bookable&&s.remaining>=example.people!)||available.find(s=>s.bookable&&s.remaining>=example.people!);
    if(!target)continue;example.slot=target.slot;example.slotEnd=target.end;example.slotId=target.id;

   }
   const order:Booking={id,userId:user.id,kind:'entry',date,slot:'09:00',people:1,status:'confirmed',entered:false,exited:false,version:1,createdAt:new Date(time).toISOString(),...example};
   await store.put('orders',id,order,runId);added++;
  }
 }
 return {added};
}
