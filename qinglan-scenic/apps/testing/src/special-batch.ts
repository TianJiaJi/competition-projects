import { delay } from './engine';
import type { SpecialSession, ScenarioId, ScenarioRuns, SpecialReport } from './special-engine';
import type { SpecialNote } from './task-store';

/** Resume unfinished scenarios in assignment order. Aborting resets only the active operation. */
export async function runSpecialSequence(session: SpecialSession, ids: ScenarioId[], options: {
  signal: AbortSignal;
  onScenario: (id: ScenarioId) => void;
  onStep?: (id: ScenarioId, step: number) => void;
  settleMs?: number;
}): Promise<boolean> {
  if(options.signal.aborted)return false;
  const cancel=()=>session.cancel();
  options.signal.addEventListener('abort',cancel,{once:true});
  try {
    for(const id of ids){
      if(options.signal.aborted)return false;
      let run=session.snapshot()[id];
      if(run.step===3)continue;
      options.onScenario(id);
      while(run.step<3){
        if(options.signal.aborted)return false;
        const step=run.step;
        if(!await session.advance(id,step) || options.signal.aborted)return false;
        options.onStep?.(id,step);
        run=session.snapshot()[id];
      }
      // Keep the completed verdict visible briefly before switching to the next case.
      await delay(options.settleMs ?? 300,options.signal);
    }
    return true;
  } catch(error){if(options.signal.aborted)return false;throw error;}
  finally {options.signal.removeEventListener('abort',cancel);}
}
export function specialReportMatches(report: SpecialReport, runs: ScenarioRuns, ids: ScenarioId[], notes: Partial<Record<ScenarioId,SpecialNote>>): boolean {
  return report.scenarios.length===ids.length && ids.every(id=>{
    const snapshot=report.scenarios.find(run=>run.scenarioId===id);
    return !!snapshot && JSON.stringify(snapshot)===JSON.stringify(runs[id]);
  }) && JSON.stringify(report.caseNotes || {})===JSON.stringify(notes);
}
