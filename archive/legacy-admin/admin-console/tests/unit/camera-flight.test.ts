import {it,expect} from 'vitest';
import {Vector3} from 'three';
import {createCameraFlight} from '../../packages/scenic/src/camera-flight';
it('flies smoothly to a point with a shorter camera distance and can restore the saved pose',()=>{
  const from={target:new Vector3(0,2,2),offset:new Vector3(32,80,120)};
  const to={target:new Vector3(15,.65,23),offset:from.offset.clone().multiplyScalar(.48)};
  const flight=createCameraFlight(from,to,1);
  const start=flight.advance(0);expect(start.target.toArray()).toEqual(from.target.toArray());
  const middle=flight.advance(.5);expect(middle.done).toBe(false);expect(middle.offset.length()).toBeLessThan(from.offset.length());expect(middle.offset.length()).toBeGreaterThan(to.offset.length());
  const end=flight.advance(.5);expect(end.done).toBe(true);expect(end.target.toArray()).toEqual(to.target.toArray());expect(end.offset.distanceTo(to.offset)).toBeLessThan(1e-10);
  const restore=createCameraFlight(end,from);const result=restore.advance(0,true);expect(result.done).toBe(true);expect(result.target.toArray()).toEqual(from.target.toArray());
});
it('keeps a safe orbit radius when restoring from an opposite manual viewing angle',()=>{
  const from={target:new Vector3(),offset:new Vector3(0,20,40)},to={target:new Vector3(8,0,2),offset:new Vector3(0,20,-40)};
  const flight=createCameraFlight(from,to,1);
  for(let i=0;i<10;i++)expect(flight.advance(.1).offset.length()).toBeCloseTo(from.offset.length(),5);
});
