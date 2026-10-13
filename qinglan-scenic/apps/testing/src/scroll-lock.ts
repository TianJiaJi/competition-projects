// Multiple dialogs can overlap during a same-tick transition. Restore only after the last closes.
const owners=new Set<symbol>();
let original='';
export function lockPageScroll(){
 const owner=Symbol('dialog');
 if(!owners.size)original=document.body.style.overflow;
 owners.add(owner);document.body.style.overflow='hidden';
 let released=false;
 return ()=>{if(released)return;released=true;owners.delete(owner);if(!owners.size)document.body.style.overflow=original;};
}
