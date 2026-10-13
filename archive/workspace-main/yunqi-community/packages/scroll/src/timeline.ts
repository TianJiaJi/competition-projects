export type ScrollIntroState='loading'|'opening'|'revealing'|'finishing'|'ready'|'failed';
export const INTRO_DURATION=6;
export const smoothProgress=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*t*(t*(t*6-15)+10);};

/** Visible time only; prepare the entire scene before starting the uninterrupted shot. */
export function createIntroTimeline(enabled:boolean){
  let time=0,failed=false;
  return {
    fail(){failed=true;},
    advance(dt:number,modelReady:boolean,reduced:boolean,hidden=false){
      if(!hidden&&!failed&&modelReady){
        if((reduced||!enabled)&&modelReady)time=INTRO_DURATION;
        else if(enabled&&!reduced)time=Math.min(INTRO_DURATION,time+Math.max(0,dt));
      }
      const state:ScrollIntroState=failed?'failed':time>=6&&modelReady?'ready':!modelReady?'loading':time<3?'opening':time<5.4?'revealing':'finishing';
      return {time,state,open:reduced||!enabled?1:smoothProgress((time-.5)/2.1),ink:1,rise:smoothProgress((time-3)/2.4),mist:smoothProgress((time-4.6)/.8)};
    },
  };
}
