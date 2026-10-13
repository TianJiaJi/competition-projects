import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {indexExactGeometry} from '../../packages/scenic/src/indexed-geometry';
import {batchStaticParts} from '../../packages/scenic/src/static-batch';
import {createHeatProjection,HEAT_REFRESH_MS} from '../../packages/scenic/src/heat';
import {sampleSnapshot} from '../../packages/client/testing/snapshot';
describe('appearance-preserving scenic optimization',()=>{
  it('keeps every triangle attribute and preserves seams',()=>{
    const geometry=new THREE.PlaneGeometry(4,4,10,10).toNonIndexed();
    const source=geometry.clone();
    indexExactGeometry(geometry);
    expect(geometry.getAttribute('position').count).toBeLessThan(source.getAttribute('position').count);
    const expanded=geometry.toNonIndexed();
    for(const name of Object.keys(source.attributes))expect(Array.from(expanded.getAttribute(name).array)).toEqual(Array.from(source.getAttribute(name).array));
    const seams=new THREE.BoxGeometry().toNonIndexed();const before=seams.clone();indexExactGeometry(seams);
    expect(seams.getAttribute('position').count).toBe(24);
    expect(Array.from(seams.toNonIndexed().getAttribute('normal').array)).toEqual(Array.from(before.getAttribute('normal').array));
  });
  it('batches nested opaque siblings without merging interactive or transparent objects',()=>{
    const root=new THREE.Group(),group=new THREE.Group();root.add(group);group.position.set(2,3,4);
    const material=new THREE.MeshStandardMaterial();
    const a=new THREE.Mesh(new THREE.BoxGeometry(),material),b=a.clone();b.position.x=3;group.add(a,b);
    const pick=a.clone();pick.userData.pointId='test';group.add(pick);
    const glass=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({transparent:true}));group.add(glass);
    root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);
    batchStaticParts(root);root.updateMatrixWorld(true);
    expect(root.children).toEqual([group]);expect(group.children).toHaveLength(3);expect(group.children).toContain(pick);expect(group.children).toContain(glass);
    const after=new THREE.Box3().setFromObject(root);expect(after.min.toArray()).toEqual(bounds.min.toArray());expect(after.max.toArray()).toEqual(bounds.max.toArray());
    const merged=group.children.find(child=>child!==pick&&child!==glass) as THREE.Mesh;
    expect(merged.geometry.index?.count).toBe(72);
  });
  it('never interpolates hidden heat and only interpolates on texture refresh',()=>{
    const heat=createHeatProjection(),snapshot=sampleSnapshot();const positions=vi.fn(()=>[]);
    heat.update(snapshot,false,positions,0);expect(positions).not.toHaveBeenCalled();
    heat.update(snapshot,true,positions,1);expect(positions).toHaveBeenCalledTimes(1);
    heat.update(snapshot,true,positions,2);expect(positions).toHaveBeenCalledTimes(1);
    heat.update(snapshot,true,positions,HEAT_REFRESH_MS+1);expect(positions).toHaveBeenCalledTimes(2);
    heat.update(snapshot,false,positions,HEAT_REFRESH_MS+2);expect(positions).toHaveBeenCalledTimes(2);
    heat.update(snapshot,true,positions,HEAT_REFRESH_MS+3);expect(positions).toHaveBeenCalledTimes(3);heat.dispose();
  });
});
