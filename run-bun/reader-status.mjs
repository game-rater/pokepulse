// Connection and prediction diagnostics only. Never changes the meter score.
export function readerStatus(state,{now=Date.now(),staleAfter=4000}={}){
 const tracking=state.tracking||{},result=state.result,outlook=result?.outlook||{};
 const stamp=value=>Number.isFinite(value)&&value>=0?value:null;
 const received=stamp(tracking.received_at),started=stamp(state.prediction_started_at),updated=stamp(state.prediction_updated_at);
 const view=(kind,title,detail,action,connection='connected',reasons=[])=>({kind,title,detail,action,connection,
  last_game_at:received,prediction_started_at:started,last_prediction_at:updated,reasons});
 if(!tracking.status||tracking.status==='disconnected')return view('disconnected','Disconnected',
  tracking.message||'No game data has reached Poképulse yet.','Open Run & Bun and check that its Poképulse integration is loaded.','disconnected');
 if(tracking.status==='unsupported')return view('unsupported','Unsupported battle',tracking.message||'This battle cannot be read.',
  'Check the supported game version and battle type.');
 if(tracking.status==='stale'||received!==null&&now-received>staleAfter)return view('stale','Game updates stopped',
  'The reader is responding, but fresh game data is not arriving.','Resume the emulator if it is paused. Otherwise, check its Poképulse integration.','stale');
 if(tracking.status==='outside-battle')return view('outside-battle','Waiting for a battle',
  'Connected to the game. No battle is active.','Enter a battle; this panel updates automatically.');
 if(tracking.status==='waiting')return view('reading','Reading battle data',tracking.message||'Waiting for both Pokémon.',
  'Wait for the battle to finish loading. If this persists, save a bug report.');
 if(tracking.status!=='battle')return view('reading','Reading battle data',tracking.message||'Waiting for a readable battle.',
  'If this persists during a normal turn, save a bug report.');
 if(state.prediction_error)return view('error','Prediction failed',String(state.prediction_error),
  'Save a bug report so the failed calculation can be investigated.');
 if(outlook.input_blocked){
  const reasons=[...new Set((outlook.unresolved_reasons||[]).filter(r=>typeof r==='string'&&r.trim()))].slice(0,8);
  return view('missing-data','Missing battle data','The battle is connected, but required information is missing.',
   'Wait for the next game update. If the information stays missing, save a bug report.','connected',reasons);
 }
 const phase=state.battle_phase||tracking.battle_phase;
 if(phase&&phase.kind!=='selection')return view('reading','Reading battle',
  'A move animation or battle transition is in progress. Waiting for the next decision.',
  'No action needed. The last prediction may remain on the meter.');
 const score=result&&(Object.hasOwn(result,'display_score')?result.display_score:result.victory);
 const usable=Number.isFinite(score);
 if(usable)return result.refining||result.pending
  ?view('refining','Refining prediction','The meter has a prediction. Poképulse is continuing the calculation.','Keep playing; the meter updates automatically.')
  :view('ready','Reading battle','Connected to the game. The latest prediction is available.','Keep playing; the meter follows the battle.');
 if(outlook.search_paused||outlook.sampling_complete||outlook.complete)return view('unavailable','Prediction unavailable',
  'The current calculation stopped without a displayable prediction.','Save a bug report if this persists during a normal turn.');
 if(started!==null||result?.refining||result?.pending)return view('calculating','Calculating',
  'The battle is connected. Poképulse is working on a prediction.','Keep playing. If no prediction appears, save a bug report.');
 return view('reading','Reading battle','The battle was detected. Waiting for a decision state.',
  'Wait for the move-selection screen.');
}
