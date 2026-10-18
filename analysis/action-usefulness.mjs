// Cheap state flags for approximate continuation policies. These are not native
// legality rules or proofs that a move can never be useful in the full game.
// No trainer identity, AI scores, or predicted opponent choice is consulted.
import {nativeMoveChoices} from './native-battle.mjs';
const firstOnly=new Set(['fakeout','firstimpression','matblock']);
const singlesFailures=new Set(['splash','celebrate','holdhands','happyhour','helpinghand','afteryou','quash']);
const effects=['boosts','heal','status','volatileStatus','sideCondition','slotCondition','weather','terrain','pseudoWeather','self','selfBoost','secondary','secondaries','forceSwitch','selfSwitch'];
const callbacks=m=>Object.keys(m).some(k=>k.startsWith('on')&&typeof m[k]==='function');
const pure=(m,effect)=>m.category==='Status'&&!callbacks(m)&&!effects.some(k=>k!==effect&&m[k]);
const moveHook=e=>Object.keys(e).some(k=>/^on.*(?:Move|Hit|Boost|PrepareHit|DeductPP)/.test(k));
const priorityHook=e=>Object.keys(e).some(k=>/^on(?:Any|Ally|Foe)?(?:ModifyPriority|FractionalPriority)$/.test(k));
function actors(p){return [p,p.side.foe.active[0]].filter(Boolean);}
function interactions(p){return actors(p).some(a=>moveHook(a.getAbility())&&!['contrary','simple'].includes(a.ability)||moveHook(a.getItem())||Object.keys(a.volatiles).length);}
function beforeFoe(p,move){
 const [self,foe]=actors(p);if(!foe||actors(p).some(a=>priorityHook(a.getAbility())||priorityHook(a.getItem())||Object.keys(a.volatiles).length))return false;
 const choices=nativeMoveChoices(foe);if(!choices.length)return false;
 return choices.every(c=>{
  const other=p.battle.dex.moves.get(c.id);if(other.onModifyPriority)return false;
  return move.priority>other.priority||move.priority===other.priority&&self.speed>foe.speed;
 });
}
export function continuationActionFlags(p,choice){
 const move=p.battle.dex.moves.get(choice.id),foe=p.side.foe.active[0];
 if(firstOnly.has(move.id)&&p.activeMoveActions>0)return ['first-turn-expired'];
 if(singlesFailures.has(move.id))return ['no-singles-effect'];
 if(interactions(p))return [];
 if(move.target==='self'&&move.boosts&&pure(move,'boosts')){
  const sign=p.hasAbility('contrary')?-1:1,changes=Object.entries(move.boosts).filter(([,n])=>n!==0);
  if(changes.length&&changes.every(([stat,n])=>n*sign>0?p.boosts[stat]>=6:p.boosts[stat]<=-6))return ['stat-limit'];
 }
 if(move.target==='self'&&move.heal&&pure(move,'heal')&&p.hp===p.maxhp&&beforeFoe(p,move))return ['heal-before-damage-at-full-hp'];
 if(move.target==='normal'&&move.status&&pure(move,'status')&&beforeFoe(p,move)){
  if(foe?.status)return ['target-already-statused'];
  if(move.status==='par'&&foe.hasType('Electric')||move.status==='brn'&&foe.hasType('Fire')||['psn','tox'].includes(move.status)&&!p.hasAbility('corrosion')&&foe.hasType(['Poison','Steel']))return ['status-type-immunity'];
  if(move.status==='slp'&&foe.hasAbility(['Insomnia','Vital Spirit','Sweet Veil','Comatose']))return ['status-ability-immunity'];
 }
 return [];
}
// Waiting can advance a poison clock, reset Protect, consume a timer, avoid a
// counter/recoil/contact penalty, or preserve attacking PP. Keep flagged waiting
// options in such positions and let native policy probes compare their value.
function waitingMatters(p){
 const b=p.battle,all=actors(p);
 if(b.field.weather||b.field.terrain||Object.keys(b.field.pseudoWeather).length)return true;
 if(all.some(a=>a.status||a.item||Object.keys(a.volatiles).length||Object.keys(a.side.sideConditions).length||Object.values(a.side.slotConditions).some(s=>Object.keys(s).length)))return true;
 if(all.some(a=>Object.keys(a.getAbility()).some(k=>/^on.*(?:Residual|Weather|Terrain|Update|Turn)/.test(k))))return true;
 const foe=p.side.foe.active[0];if(!foe)return true;
 const own=nativeMoveChoices(p),enemy=nativeMoveChoices(foe).filter(c=>!continuationActionFlags(foe,c).length);
 if(!enemy.length||enemy.some(c=>{const m=b.dex.moves.get(c.id);return m.category==='Status'||m.recoil||m.selfdestruct||callbacks(m);}))return true;
 const attacks=own.filter(c=>b.dex.moves.get(c.id).category!=='Status'&&!continuationActionFlags(p,c).length);
 if(!attacks.length||attacks.some(c=>{const m=b.dex.moves.get(c.id);return m.recoil||m.selfdestruct||m.self||callbacks(m);}))return true;
 // A small attack reserve may be worth saving until the enemy runs out of PP.
 return attacks.reduce((n,c)=>n+(c.pp||0),0)<enemy.reduce((n,c)=>n+(c.pp||0),0);
}
export function selectContinuationChoices(p,{filterUselessTurns=true}={}){
 const legal=nativeMoveChoices(p),moves=legal.length?legal:[{slot:1,id:'struggle'}];
 const flags=moves.map(c=>({slot:c.slot,reasons:continuationActionFlags(p,c)}));
 if(!filterUselessTurns)return {choices:moves,flags,filtered:[],waiting:false};
 const useful=moves.filter((_,i)=>!flags[i].reasons.length),waiting=waitingMatters(p);
 const choices=useful.length&&!waiting?useful:moves;
 return {choices,flags,filtered:moves.filter(c=>!choices.includes(c)).map(c=>c.slot),waiting};
}
