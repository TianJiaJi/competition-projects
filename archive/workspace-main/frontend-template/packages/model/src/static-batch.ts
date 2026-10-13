import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
/** Batch opaque static siblings, retaining groups used for picking and status changes. */
export function batchStaticParts(group:THREE.Object3D){
  for(const child of [...group.children])if(child instanceof THREE.Group)batchStaticParts(child);
  const batches=new Map<string,THREE.Mesh<THREE.BufferGeometry,THREE.Material>[]>();
  for(const child of group.children){
    if(!(child instanceof THREE.Mesh)||child instanceof THREE.InstancedMesh||child instanceof THREE.SkinnedMesh||child.userData.pointId||Array.isArray(child.material)||child.material.transparent||!child.visible)continue;
    const key=[child.material.uuid,child.castShadow,child.receiveShadow,child.renderOrder,child.layers.mask].join(':');
    const batch=batches.get(key)??[];batch.push(child);batches.set(key,batch);
  }
  for(const children of batches.values()){
    if(children.length<2)continue;
    const copies=children.map(child=>{child.updateMatrix();return child.geometry.clone().applyMatrix4(child.matrix);});
    // Incompatible vertex layouts remain separate.
    const first=copies[0];
    const attributes=Object.keys(first.attributes).sort().join(',');
    const compatible=copies.every(g=>!!g.index===!!first.index&&Object.keys(g.attributes).sort().join(',')===attributes&&Object.entries(g.attributes).every(([name,a])=>a.itemSize===first.getAttribute(name).itemSize&&a.normalized===first.getAttribute(name).normalized&&a.array.constructor===first.getAttribute(name).array.constructor));
    const combined=compatible?mergeGeometries(copies):null;copies.forEach(g=>g.dispose());
    if(!combined)continue;
    const original=children[0],mesh=new THREE.Mesh(combined,original.material);
    mesh.castShadow=original.castShadow;mesh.receiveShadow=original.receiveShadow;mesh.renderOrder=original.renderOrder;mesh.layers.mask=original.layers.mask;
    group.remove(...children);group.add(mesh);
  }
}
