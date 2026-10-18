import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyForecast,predictionReport,hasResolvedCertificate} from '../analysis/result-contract.mjs';
import {createSearchRequest,searchArguments,observationProvenance} from '../run-bun/battle-state.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {pack,catalog,defaultBuild,defaultField,scoreBattle} from '../run-bun/profile.mjs';
import {chooseSearchResult,SearchService} from '../run-bun/search-service.mjs';

const exact=(lower,upper,extra={})=>({lower_bound:lower,upper_bound:upper,complete:true,...extra});
const sampled=extra=>({...exact(80,80),approximate:true,provisional_usable:true,provisional_score:63,sampling_complete:true,...extra});
test('A completed sample budget cannot create a certificate, even with coincident legacy bounds',()=>{
 const p=predictionReport(sampled());assert.equal(p.kind,'estimate');assert.equal(p.certificate,null);
 assert.equal(p.search.resolved,false);assert.equal(p.estimate.score,63);
 assert.equal(hasResolvedCertificate({outlook:sampled()}),false);
});
test('Tolerance completion preserves an interval instead of claiming a proven value',()=>{
 const p=predictionReport(exact(51,51.5));assert.equal(p.kind,'bounded');assert.equal(p.certificate.width,0.5);
 assert.equal(p.search.resolved,true);
});
test('Coincident model bounds take precedence over a stale provisional estimate',()=>{
 const p=predictionReport(exact(0,0,{provisional_score:99,provisional_usable:true}));
 assert.equal(p.kind,'proven');assert.equal(p.estimate.score,0);
});
test('Blocked complete results cannot win the worker race or publish an estimate',()=>{
 const blocked={outlook:exact(100,100,{input_blocked:true,provisional_score:100,provisional_usable:true})};
 const hybrid={outlook:sampled()};assert.equal(chooseSearchResult({exact:blocked,hybrid}).engine,'hybrid');
 const p=predictionReport(blocked.outlook);assert.equal(p.certificate,null);assert.equal(p.estimate.score,null);
});
test('Invalid and explicitly uncertified intervals do not become certificates',()=>{
 for(const outlook of [exact(70,20),exact(-1,50),exact(0,101),exact(NaN,50),exact(50,50,{certified:false})]){
  assert.equal(classifyForecast(outlook).certificate,null);assert.equal(hasResolvedCertificate({outlook}),false);
 }
});
test('Unready samples and completely unknown bounds have no display estimate',()=>{
 assert.equal(predictionReport(sampled({provisional_usable:false})).estimate.score,null);
 assert.equal(predictionReport(exact(0,100,{complete:false}),70).estimate.score,null);
});
test('Published display and prediction point agree',()=>{
 const s=new SearchService({parallel:false});let published;s.onResult=r=>published=r;
 s.publish({outlook:sampled()});assert.equal(published.display_score,published.prediction.estimate.score);
 s.cancel();
});

function snapshot(){
 const species=pack.species.find(s=>s.id==='mew');
 const side=()=>({species:species.id,hp_percent:100,build:{...defaultBuild(species),ability:'',item:'',moves:['Tackle']},effects:{}});
 return {schema_version:1,game:'run-bun',player:side(),opponent:side(),field:defaultField()};
}
test('Supplied false and zero values remain supplied; omitted counters remain unknown',()=>{
 const s=snapshot();s.player.effects={first_turn:false,protect_streak:0,move_history_known:true};
 const p=observationProvenance(s,'emulator');assert.equal(p.source,'emulator');
 assert.ok(p.supplied.includes('player.effects.first_turn'));assert.ok(p.supplied.includes('player.effects.protect_streak'));
 assert.ok(!p.unknown.includes('player.effects.protect_streak'));assert.ok(p.unknown.includes('opponent.effects.first_turn'));
 assert.ok(p.assumed.includes('player.effects.taunted'));
});
test('A placeholder nature can be supplied while its true value remains unknown',()=>{
 const s=snapshot();s.player.effects.nature_unknown=true;const p=observationProvenance(s);
 assert.ok(p.supplied.includes('player.build.nature'));assert.ok(p.unknown.includes('player.build.nature'));
});
test('Normalization detaches mutable effects and preserves diagnostic provenance',()=>{
 const s=snapshot();s.player.effects.disabled_moves=['Tackle'];
 const n=normalizeSnapshot(s,pack,catalog(),{source:'diagnostic'});s.player.effects.disabled_moves.length=0;
 assert.deepEqual(n.effects.player.disabled_moves,['Tackle']);assert.equal(n.live.observation_provenance.source,'diagnostic');
});
test('Named search requests preserve all positional engine values and detach caller input',()=>{
 const s=snapshot(),n=normalizeSnapshot(s,pack,catalog());const species=pack.species.find(p=>p.id===n.player);
 const args=[species,species,{generation:8},n.battle,n.builds,n.field,n.effects,n.live];
 const request=createSearchRequest(args);assert.deepEqual(searchArguments(request),args);
 args[4].player.moves[0]='Splash';args[6].player.disabled_moves.push('Tackle');
 assert.deepEqual(request.builds.player.moves,['Tackle']);assert.deepEqual(request.effects.player.disabled_moves,[]);
});
test('Unknown request versions fail at the worker boundary',()=>{
 assert.throws(()=>searchArguments({schema_version:2,game:'run-bun'}),/Unsupported/);
});
test('Exact HP and percentages must agree at the observation boundary',()=>{
 const s=snapshot();s.player.actual_stats={hp:100,atk:20,def:20,spa:20,spd:20,spe:20};s.player.current_hp=50;
 assert.throws(()=>normalizeSnapshot(s,pack,catalog()),/Exact HP disagrees/);
});
test('Invalid live PP is rejected rather than silently omitted',()=>{
 const s=snapshot();s.player.pp={Tackle:-1};assert.throws(()=>normalizeSnapshot(s,pack,catalog()),/Invalid PP/);
});
test('The scoring entry point validates live PP, not just the normalized snapshot API',()=>{
 const s=snapshot(),species=pack.species.find(p=>p.id===s.player.species);
 assert.throws(()=>scoreBattle(species,species,{generation:8},{player_hp:100,opponent_hp:100},
  {player:s.player.build,opponent:s.opponent.build},s.field,{player:{},opponent:{}},{player:{pp:{Tackle:-1}}}),/Invalid PP/);
});
test('The scoring entry point rejects inconsistent exact HP before searching',()=>{
 const s=snapshot(),species=pack.species.find(p=>p.id===s.player.species);
 assert.throws(()=>scoreBattle(species,species,{generation:8},{player_hp:100,opponent_hp:100},
  {player:s.player.build,opponent:s.opponent.build},s.field,{player:{},opponent:{}},
  {player:{actual_stats:{hp:100,atk:20,def:20,spa:20,spd:20,spe:20},current_hp:50}}),/Exact HP disagrees/);
});
