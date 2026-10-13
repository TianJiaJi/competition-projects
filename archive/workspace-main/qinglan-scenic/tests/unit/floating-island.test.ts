import {it,expect} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {centeredIslandPose,rotateIslandPose,createIslandFlight,type IslandPose} from '../../packages/scenic/src/floating-island';

function matrix(p:IslandPose){return new Matrix4().makeRotationY(p.heading).setPosition(p.position);}
it('rotates the island around its fixed overview center and preserves map coordinates for heat and picking',()=>{
  const center=new Vector3(0,2,2),pose=centeredIslandPose(center,Math.PI/2),transform=matrix(pose);
  expect(center.clone().applyMatrix4(transform).distanceTo(center)).toBeLessThan(1e-10);
  const point=new Vector3(12,8,-4),world=point.clone().applyMatrix4(transform);
  expect(world.distanceTo(point)).toBeGreaterThan(1);
  expect(world.applyMatrix4(transform.clone().invert()).distanceTo(point)).toBeLessThan(1e-10);
});
it('keeps a selected facility stationary during detail rotation and smoothly restores the saved island pose',()=>{
  const saved=centeredIslandPose(new Vector3(0,2,2),.7),facility=new Vector3(12,15,-9);
  const pivot=facility.clone().applyMatrix4(matrix(saved));
  const turned=rotateIslandPose(saved,pivot,Math.PI*.8);
  expect(facility.clone().applyMatrix4(matrix(turned)).distanceTo(pivot)).toBeLessThan(1e-10);
  const flight=createIslandFlight(turned,saved,1);
  const middle=flight.advance(.5);
  expect(middle.position.distanceTo(saved.position)).toBeGreaterThan(0);
  expect(middle.position.distanceTo(saved.position)).toBeLessThan(turned.position.distanceTo(saved.position));
  const end=flight.advance(.5);
  expect(end.position.toArray()).toEqual(saved.position.toArray());expect(end.heading).toBe(saved.heading);
});
