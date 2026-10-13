// Applied only in desktop Vite configs, including their imported shared CSS.
// Container dimensions and viewport lengths now use the same compensated space.
interface Root {
  walkDecls(callback:(declaration:{value:string})=>void):void;
  walkAtRules(name:string,callback:(rule:{name:string;params:string})=>void):void;
}
export function desktopDisplayCss(){
  return {postcssPlugin:'scenic-desktop-display',Once(root:Root){
    root.walkDecls(declaration=>{
      declaration.value=declaration.value.replace(/(-?(?:\d*\.)?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/g,(_,number:string,unit:string)=>{
        const axis=unit.endsWith('vh')?'vh':unit.endsWith('vw')?'vw':unit;
        return `calc(${number} * var(--desktop-${axis}, 1${unit}))`;
      });
    });
    root.walkAtRules('media',rule=>{
      if(/^\s*\((?:min-|max-)?(?:width|height)\s*:\s*[\d.]+px\)(?:\s+and\s+\((?:min-|max-)?(?:width|height)\s*:\s*[\d.]+px\))*\s*$/.test(rule.params)){
        rule.name='container';rule.params=`desktop-viewport ${rule.params}`;
      }
    });
  }};
}
