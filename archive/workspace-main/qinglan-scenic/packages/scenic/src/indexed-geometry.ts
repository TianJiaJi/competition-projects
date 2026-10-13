import * as THREE from 'three';
/** Share only exactly equal attribute tuples; do not weld seams or alter triangles. */
export function indexExactGeometry(source:THREE.BufferGeometry){
  if(source.index||Object.keys(source.morphAttributes).length)return source;
  const entries=Object.entries(source.attributes);
  if(entries.some(([,attribute])=>attribute instanceof THREE.InterleavedBufferAttribute))return source;
  const count=source.getAttribute('position').count;
  const unique:number[]=[],indices:number[]=[],lookup=new Map<string,number>();
  for(let vertex=0;vertex<count;vertex++){
    const key=entries.map(([,attribute])=>{
      const values=[];for(let component=0;component<attribute.itemSize;component++)values.push(attribute.array[vertex*attribute.itemSize+component]);
      return values.join(',');
    }).join('|');
    let index=lookup.get(key);
    if(index===undefined){index=unique.length;lookup.set(key,index);unique.push(vertex);}
    indices.push(index);
  }
  if(unique.length===count)return source;
  for(const [name,attribute] of entries){
    const values=new (attribute.array.constructor as {new(length:number):THREE.TypedArray})(unique.length*attribute.itemSize);
    unique.forEach((vertex,index)=>{for(let component=0;component<attribute.itemSize;component++)values[index*attribute.itemSize+component]=attribute.array[vertex*attribute.itemSize+component];});
    const next=new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized);next.name=attribute.name;next.setUsage((attribute as THREE.BufferAttribute).usage);source.setAttribute(name,next);
  }
  source.userData.exactIndex={originalVertices:count,sharedVertices:unique.length};
  source.setIndex(indices);return source;
}
