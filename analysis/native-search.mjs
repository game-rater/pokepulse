import {createCompleteBattle,completeMoveAdapter} from './native-battle.mjs';
import {searchBattle} from './search.mjs';
export function prepareNativePosition(snapshot,options){
  const session=options.session?(options.session.completeMoves??={}):{};
  const signature=JSON.stringify(snapshot);
  if(session.snapshotSignature!==signature){session.snapshotSignature=signature;session.reasons=new Set();}
  const reasons=session.reasons,sides=[snapshot.player,snapshot.opponent];
  for(const side of sides)for(const effect of side.effects?.unknown_effects||[])reasons.add(`Live effect is unavailable: ${effect}.`);
  for(const side of sides){if(side.build.status==='slp'&&side.effects?.sleep_counter==null)reasons.add('Sleeping Pokémon has no known wake-up counter.');}
  for(const [active,counter] of [[snapshot.field?.weather,'weather_turns'],[snapshot.field?.terrain,'terrain_turns'],[snapshot.field?.isTrickRoom,'trick_room_turns']])
    if(active&&!sides.some(s=>s.effects?.[counter]!=null))reasons.add(`Live ${counter} is unavailable.`);
  for(let i=0;i<2;i++)for(const [active,counter] of [[(i?snapshot.field?.defenderSide:snapshot.field?.attackerSide)?.isReflect,'reflect_turns'],[(i?snapshot.field?.defenderSide:snapshot.field?.attackerSide)?.isLightScreen,'light_screen_turns'],[(i?snapshot.field?.defenderSide:snapshot.field?.attackerSide)?.isTailwind,'tailwind_turns']])
    if(active&&sides[i].effects?.[counter]==null)reasons.add(`Live ${counter} is unavailable.`);
  if(sides.some(s=>s.current_hp===0))reasons.clear();
  const initial=reasons.size?null:createCompleteBattle(snapshot);
  return {initial,reasons,session};

}
export function searchNativePosition(initial,reasons,options,session,resolveContinuation){
 const base=completeMoveAdapter(reasons);
 const adapter={...base,terminal:state=>base.terminal(state)??resolveContinuation(state)};
 const r=searchBattle(adapter,initial,{...options,session,focusedStrategy:false});
  return {score:r.upper-r.lower>=1-1e-10?null:100*r.lower,provisional_score:100*(r.partial_estimate??(r.lower+r.upper)/2),
    lower_bound:100*r.lower,upper_bound:100*r.upper,unresolved:r.upper-r.lower,score_kind:'certified-lower-bound',
    algorithm:'bounded-stochastic-game-search',opponent_model:'simultaneous minimax (mixed strategies)',...r,
    omitted_moves:[],unresolved_reasons:[...reasons,...(r.complete?[]:['Unfinished continuations leave uncertainty.'])],
    input_blocked:initial===null,
    move_engine:'pokemon-showdown 0.11.11 with Run & Bun overrides'};
}

