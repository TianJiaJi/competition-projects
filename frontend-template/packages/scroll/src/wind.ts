import {smoothProgress} from './timeline';

/** Continuous wind with a soft pickup and delayed response at the far roller. */
export function scrollWind(time:number){
  const envelope=smoothProgress(time/3.5);
  return {
    envelope,
    lift:(.70*Math.sin(time*.40)+.32*Math.sin(time*.27))*envelope,
    left:(Math.sin(time*.46)+.25*Math.sin(time*.29))*envelope,
    right:(.85*Math.sin(time*.46-.95)+.30*Math.sin(time*.29-.55))*envelope,
    sway:.50*Math.sin(time*.34)*envelope,
    pitch:.004*Math.sin(time*.31)*envelope,
    roll:.003*Math.sin(time*.27)*envelope,
  };
}
