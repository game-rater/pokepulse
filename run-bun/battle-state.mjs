/**
 * @typedef {Object} SearchRequest
 * @property {1} schema_version
 * @property {'run-bun'} game
 * @property {Object} species
 * @property {Object} rules
 * @property {Object} battle
 * @property {Object} builds
 * @property {Object} field
 * @property {Object} effects
 * @property {Object} live
 * @property {Object} provenance
 */
// Supplied means present in adapter input, not necessarily measured by an emulator.
export function observationProvenance(input,source='unattributed'){
  if(!['emulator','diagnostic','unattributed'].includes(source))throw Error('Unknown observation source.');
  const supplied=[],unknown=[],assumed=[];
  const visit=(value,path)=>{
    if(value===undefined)return;
    if(value===null||typeof value!=='object'||Array.isArray(value)){supplied.push(path);return;}
    for(const [key,child] of Object.entries(value))visit(child,path?`${path}.${key}`:key);
  };
  visit(input,'');
  for(const side of ['player','opponent']){
    const mon=input[side],effects=mon.effects||{};
    for(const key of ['actual_stats','current_hp','pp'])if(mon[key]===undefined)unknown.push(`${side}.${key}`);
    for(const key of ['first_turn','protect_streak'])if(effects[key]===undefined||effects[key]===null)unknown.push(`${side}.effects.${key}`);
    if(effects.move_history_known!==true)unknown.push(`${side}.effects.move_history`);
    if(effects.nature_unknown)unknown.push(`${side}.build.nature`);
    for(const [active,counter] of [[input.field.weather,'weather_turns'],[input.field.terrain,'terrain_turns'],[input.field.trick_room,'trick_room_turns'],[input.field[side]?.reflect,'reflect_turns'],[input.field[side]?.light_screen,'light_screen_turns'],[input.field[side]?.tailwind,'tailwind_turns']])
      if(active&&effects[counter]==null)unknown.push(`${side}.effects.${counter}`);
    if(mon.build.status==='slp'&&effects.sleep_counter===undefined)unknown.push(`${side}.effects.sleep_counter`);
    for(const key of ['taunted','disabled_moves'])if(effects[key]===undefined)assumed.push(`${side}.effects.${key}`);
    for(const effect of effects.unknown_effects||[])unknown.push(`${side}.effects:${effect}`);
  }
  return {source,supplied,unknown,assumed};
}
export function snapshotInput(args){
  const [player,opponent,,battle,builds,field,effects,live={}]=args;
  const side=(name,species)=>({species:species.id,hp_percent:battle[`${name}_hp`],build:builds[name],effects:effects[name],...live[name]});
  return {schema_version:1,game:'run-bun',player:side('player',player),opponent:side('opponent',opponent),field};
}
/** Named, cloned worker boundary. Simulated states stay engine-owned. @returns {SearchRequest} */
export function createSearchRequest(args){
  const [player,opponent,rules,battle,builds,field,effects,live={}]=args;
  return structuredClone({schema_version:1,game:'run-bun',species:{player,opponent},rules,battle,builds,field,effects,live,
    provenance:live.observation_provenance||observationProvenance(snapshotInput(args))});
}
// The positional engine API stays behind one compatibility adapter.
export function searchArguments(request){
  if(request?.schema_version!==1||request.game!=='run-bun')throw Error('Unsupported battle search request.');
  return [request.species.player,request.species.opponent,request.rules,request.battle,request.builds,request.field,request.effects,request.live];
}
