import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,packed,completeMoveAdapter,simulateCompleteMoves} from '../analysis/complete-moves.mjs';
import {searchBattle} from '../analysis/search.mjs';
import {simulateSampledMovesCore} from '../analysis/sampled-moves.mjs';
import {mon,observeSimpleTurn} from '../scripts/search-benchmark-fixtures.mjs';

// Independent finite-race oracle. No simulator or search code is used here.
// Fixed damage, unequal speeds, no items, and optionally player paralysis.
function race(hp,foeHP,damage,incoming,first,chance=1){
 if(hp<=0)return 0;if(foeHP<=0)return 1;
 if(!first){hp-=incoming;if(hp<=0)return 0;}
 const branch=hit=>{
  const remaining=foeHP-(hit?damage:0);if(remaining<=0)return 1;
  const health=hp-(first?incoming:0);
  return health<=0?0:race(health,remaining,damage,incoming,first,chance);
 };
 return chance*branch(true)+(1-chance)*branch(false);
}
function setup(hp,foeHP,first,{paralyzed=false,damage=20,incoming=30}={}){
 const player=mon(['Night Shade'],{hp,spe:first?100:10,level:damage});
 const opponent=mon(['Night Shade'],{hp:foeHP,spe:first?10:100,level:incoming});
 if(paralyzed)player.build.status='par';
 return {player,opponent,field:{}};
}
function native(snapshot,roll=0.5){
 const initial=createCompleteBattle(snapshot),battle=restoreCompleteBattle(initial);
 installChanceTape(battle,[],initial.unknownNature,initial,()=>roll);
 return {initial,battle};
}
function stateOf(battle,initial){return packed(battle,initial.unknownNature,{unknownFirst:[false,false],unknownHistory:[false,false],unknownGender:initial.unknownGender});}
function forecast(state,session={}){return searchBattle(completeMoveAdapter(),state,{session,timeMs:1000,maxDepth:24,maxNodes:20000,tolerance:1e-10});}
function turn(battle,a=1,b=1){assert.equal(battle.choose('p1',`move ${a}`),true);assert.equal(battle.choose('p2',`move ${b}`),true);}
function valid(result){
 assert.ok(Number.isFinite(result.lower)&&Number.isFinite(result.upper));
 assert.ok(result.lower>=-1e-10&&result.upper<=1+1e-10&&result.lower<=result.upper+1e-10);
}

for(const first of [true,false])for(const [hp,foeHP] of [[100,100],[100,40],[45,40],[30,20],[20,20],[1,100]]){
 test(`Fixed-damage battle stays correct turn by turn: HP ${hp}/${foeHP}, player ${first?'faster':'slower'}`,()=>{
  const snapshot=setup(hp,foeHP,first),{initial,battle}=native(snapshot),session={};let observations=0;
  for(let t=0;t<10;t++){
   const p=battle.p1.active[0],q=battle.p2.active[0],expected=race(p.hp,q.hp,20,30,first);
   const result=forecast(stateOf(battle,initial),session);valid(result);
   assert.ok(result.complete,`unfinished at turn ${t}`);
   assert.ok(Math.abs(result.lower-expected)<1e-9,`turn ${t}: ${result.lower} vs ${expected}`);
   observations++;if(p.hp<=0||q.hp<=0)break;
   const priorPP=p.moveSlots[0].pp;turn(battle);
   assert.ok(p.moveSlots[0].pp<=priorPP);
  }
  assert.ok(observations>=2);assert.ok(battle.p1.active[0].hp<=0||battle.p2.active[0].hp<=0);
 });
}

for(const first of [true,false])for(const roll of [0.1,0.5]){
 test(`Paralysis odds update after observed turns: ${first?'faster':'slower'}, draw ${roll}`,()=>{
  const snapshot=setup(85,40,first,{paralyzed:true,incoming:20}),{initial,battle}=native(snapshot,roll),session={};
  for(let t=0;t<6;t++){
   const p=battle.p1.active[0],q=battle.p2.active[0];
   const expected=race(p.hp,q.hp,20,20,first,0.75),result=forecast(stateOf(battle,initial),session);valid(result);
   assert.ok(result.complete);assert.ok(Math.abs(result.lower-expected)<1e-9,`turn ${t}: ${result.lower} vs ${expected}`);
   if(p.hp<=0||q.hp<=0)break;turn(battle);
  }
 });
}

for(const mode of ['minimax','npc-ai'])for(const first of [true,false])for(const hp of [25,100]){
 test(`${mode} estimates follow a whole observed fixed-damage battle (${hp} HP, ${first?'fast':'slow'})`,()=>{
  let snapshot=setup(hp,60,first),session={};
  for(let t=0;t<7;t++){
   const expected=race(snapshot.player.current_hp,snapshot.opponent.current_hp,20,30,first);
   let result;
   for(let pass=0;pass<12;pass++){
    result=simulateCompleteMoves(snapshot,{session,opponentModel:mode,approximateCompleteMoves:true,samplesPerPair:4,timeMs:50});
    if(Number.isFinite(result.score))break;
   }
   assert.ok(Number.isFinite(result.score),`missing reading at turn ${t}`);
   assert.ok(Math.abs(result.score-expected*100)<=1.01,`turn ${t}: ${result.score} vs ${expected*100}`);
   if(!snapshot.player.current_hp||!snapshot.opponent.current_hp){assert.equal(result.score,expected*100);break;}
   snapshot=observeSimpleTurn(snapshot).observed;
  }
 });
}

for(const hp of [15,25])test(`Sleep counter expires during the forecast and observed battle (${hp} HP)`,()=>{
 const snapshot=setup(hp,20,true,{incoming:20});snapshot.player.build.status='slp';snapshot.player.effects.sleep_counter=2;
 const {initial,battle}=native(snapshot),session={};
 const before=forecast(stateOf(battle,initial),session);assert.ok(before.complete);assert.equal(before.lower,hp===25?1:0);
 turn(battle);
 assert.equal(battle.p2.active[0].hp,20);
 if(hp===25){assert.equal(battle.p1.active[0].statusState.time,1);turn(battle);assert.equal(battle.p1.active[0].status,'');assert.equal(battle.p2.active[0].hp,0);}
 const after=forecast(stateOf(battle,initial),session);assert.equal(after.lower,hp===25?1:0);assert.equal(after.upper,after.lower);
});

for(const first of [true,false])test(`Damaging the opponent cannot worsen a plain fixed-damage race (${first?'fast':'slow'})`,()=>{
 let previous=1;
 for(const foeHP of [1,20,21,40,60,80,100]){
  const value=simulateCompleteMoves(setup(65,foeHP,first),{timeMs:1000,maxDepth:24,tolerance:1e-10});
  assert.ok(value.complete);assert.ok(value.lower<=previous+1e-10);previous=value.lower;
 }
});
for(const first of [true,false])test(`Losing player HP cannot improve a plain fixed-damage race (${first?'fast':'slow'})`,()=>{
 let previous=0;
 for(const hp of [1,20,21,40,60,80,100]){
  const value=simulateCompleteMoves(setup(hp,60,first),{timeMs:1000,maxDepth:24,tolerance:1e-10});
  assert.ok(value.complete);assert.ok(value.lower>=previous-1e-10);previous=value.lower;
 }
});

test('Repeated identical observations reuse samples instead of drifting or restarting',()=>{
 const snapshot={player:mon(['Night Shade']),opponent:mon(['Splash'],{hp:20}),field:{}},session={};
 const options={session,opponentModel:'npc-ai',approximateCompleteMoves:true,samplesPerPair:4,timeMs:100};
 const first=simulateCompleteMoves(snapshot,options);
 for(let i=0;i<12;i++){
  const again=simulateCompleteMoves(structuredClone(snapshot),options);
  assert.equal(again.score,first.score);assert.equal(again.samples,first.samples);assert.equal(again.root_reused,true);
 }
});
test('A reused session does not carry a previous win into a newly losing position',()=>{
 const session={};
 for(const snapshot of [setup(100,20,true),setup(1,100,false),setup(100,20,true)]){
  const result=simulateCompleteMoves(snapshot,{session,timeMs:1000,maxDepth:24,tolerance:1e-10});
  const fresh=simulateCompleteMoves(snapshot,{timeMs:1000,maxDepth:24,tolerance:1e-10});
  assert.equal(result.lower,fresh.lower);assert.equal(result.upper,fresh.upper);
 }
});

for(const hp of [20,100])test(`Exhausting the final PP changes later turns to Struggle (${hp} HP)`,()=>{
 const snapshot={player:mon(['Night Shade'],{hp,pp:1,spe:100}),opponent:mon(['Splash'],{hp:21,spe:10}),field:{}};
 const {initial,battle}=native(snapshot),session={},expected=hp===100?1:0;
 const before=forecast(stateOf(battle,initial),session);assert.ok(before.complete);assert.equal(before.lower,expected);
 turn(battle);assert.equal(battle.p1.active[0].moveSlots[0].pp,0);assert.equal(battle.p2.active[0].hp,1);
 const exhausted=forecast(stateOf(battle,initial),session);assert.ok(exhausted.complete);assert.equal(exhausted.lower,expected);
 turn(battle);assert.ok(battle.log.some(line=>line.startsWith('|move|')&&line.includes('|Struggle|')));
 const after=forecast(stateOf(battle,initial),session);assert.equal(after.lower,expected);assert.equal(after.upper,expected);
});

for(const item of ['','Focus Sash'])test(`Survival item is consumed before rerooting (${item||'no item'})`,()=>{
 const snapshot=setup(100,40,true,{incoming:100});snapshot.player.build.item=item;
 const {initial,battle}=native(snapshot),session={},expected=item?1:0;
 assert.equal(forecast(stateOf(battle,initial),session).lower,expected);
 turn(battle);
 assert.equal(battle.p1.active[0].hp,item?1:0);assert.equal(battle.p1.active[0].item,'');
 assert.equal(forecast(stateOf(battle,initial),session).lower,expected);
 if(item){turn(battle);assert.equal(battle.p2.active[0].hp,0);assert.equal(forecast(stateOf(battle,initial),session).lower,1);}
});

for(const item of ['','Sitrus Berry'])test(`A consumed healing berry changes the full attack race (${item||'no item'})`,()=>{
 const snapshot=setup(100,60,true,{incoming:60});snapshot.player.build.item=item;
 const {initial,battle}=native(snapshot),session={},expected=item?1:0;
 assert.equal(forecast(stateOf(battle,initial),session).lower,expected);
 turn(battle);assert.equal(battle.p1.active[0].hp,item?65:40);assert.equal(battle.p1.active[0].item,'');
 assert.equal(forecast(stateOf(battle,initial),session).lower,expected);
 turn(battle);
 assert.equal(forecast(stateOf(battle,initial),session).lower,expected);
 if(item){assert.equal(battle.p1.active[0].hp,5);turn(battle);assert.equal(battle.p2.active[0].hp,0);}
});

for(const stage of [0,3,8])test(`Toxic damage and counter growth stay correct through a battle (stage ${stage})`,()=>{
 const player=mon(['Night Shade'],{spe:100}),opponent=mon(['Splash'],{hp:60,spe:10});
 player.build.status='tox';player.effects.toxic_counter=stage;
 const {initial,battle}=native({player,opponent,field:{}}),session={};
 const oracle=(hp,foeHP,counter)=>{
  while(hp>0&&foeHP>0){foeHP-=20;if(foeHP<=0)return 1;counter=Math.min(15,counter+1);hp-=Math.floor(100/16)*counter;}
  return hp>0?1:0;
 };
 for(let t=0;t<5;t++){
  const p=battle.p1.active[0],q=battle.p2.active[0];
  const expected=oracle(p.hp,q.hp,p.statusState.stage),result=forecast(stateOf(battle,initial),session);
  assert.ok(result.complete);assert.equal(result.lower,expected,`turn ${t}`);assert.equal(result.upper,expected);
  if(p.hp<=0||q.hp<=0)break;
  const hp=p.hp,counter=p.statusState.stage;turn(battle);
  if(q.hp>0){assert.equal(p.statusState.stage,counter+1);assert.equal(p.hp,Math.max(0,hp-Math.floor(100/16)*(counter+1)));}
 }
});

test('Choosing Protect delays damage by exactly one observed turn, not indefinitely',()=>{
 const snapshot={player:mon(['Protect','Night Shade'],{hp:25,spe:100}),opponent:mon(['Night Shade'],{hp:20,spe:10}),field:{}};
 const {initial,battle}=native(snapshot);
 turn(battle,1,1);assert.equal(battle.p1.active[0].hp,25);assert.equal(battle.p2.active[0].hp,20);
 assert.ok(battle.p1.active[0].volatiles.stall);
 const result=forecast(stateOf(battle,initial));valid(result);assert.equal(result.upper,1,'a limited search must not exclude the immediate winning attack');
 for(const opponentModel of ['minimax','npc-ai']){
  const sampled=simulateSampledMovesCore(stateOf(battle,initial),{opponentModel,samplesPerPair:4,timeMs:1000,session:{}},new Set());
  assert.ok(sampled.provisional_usable);assert.ok(sampled.score>=95,opponentModel);
 }
 turn(battle,2,1);assert.equal(battle.p2.active[0].hp,0);
});
