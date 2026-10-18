import {referenceMon as mon} from './accuracy-benchmark-fixtures.mjs';
const source='https://github.com/smogon/pokemon-showdown/blob/master/data/';
const make=(id,player,opponent,description)=>({id:'stall-'+id,group:'stall',family:'stall',oracle:'stall:'+id,description,
 provenance:{kind:'analytic-control',sources:[source+'conditions.ts',source+'moves.ts',source+'items.ts',source+'abilities.ts'],notes:'Synthetic active-pair stall controls with independent resource/HP proofs; not recorded battles or ROM verification.'},snapshot:{player,opponent,field:{}}});
const passive=()=>mon('Mew',['Splash'],{item:'Leftovers'});
const foe=(options={})=>mon('Blissey',['Seismic Toss'],{level:20,status:'psn',...options});
const cycle=()=>mon('Mew',['Recover','Protect'],{hp:1,item:'Leftovers'});
const cycleFoe=()=>foe({level:100,item:'Leftovers'});
const protect=(streak=0)=>mon('Mew',['Protect'],{hp:1,effects:{protect_streak:streak}});
const toxic=(options={})=>foe({level:100,hp:50,status:'tox',effects:{toxic_counter:0},...options});
const lowPP=cycle();lowPP.pp={Recover:1,Protect:1};
const longFoe=mon('Blissey',['Seismic Toss','Recover'],{level:20,status:'psn',item:'Leftovers'});longFoe.pp.Recover=5;
function progressed(turn){const p=cycle(),q=cycleFoe();p.current_hp=283;p.pp.Recover-=turn/2;p.pp.Protect-=turn/2;
 p.effects={...p.effects,protect_streak:1,last_move:'Protect'};q.current_hp=570-41*(turn-1);q.pp['Seismic Toss']-=turn;return [p,q];}
export const stallFixtures=[
 make('poison-clock',passive(),foe(),'Passive healing outlasts ordinary poison'),
 make('poison-leftovers',passive(),foe({item:'Leftovers'}),'Opponent Leftovers prolongs the poison clock'),
 make('recovery-delay',passive(),longFoe,'Five enemy Recover PP can delay the poison win beyond 24 turns'),
 make('recover-protect',cycle(),cycleFoe(),'Alternate recovery and protection until poison wins'),
 make('recover-protect-mid',...progressed(8),'Same winning plan after eight completed turns'),
 make('recover-protect-late',...progressed(12),'Same winning plan after twelve completed turns'),
 make('pp-exhaustion',lowPP,cycleFoe(),'One PP of each move cannot sustain the otherwise winning plan'),
 make('protect-risk',protect(),toxic(),'Two consecutive Protect successes required for Toxic to finish'),
 make('protect-used',protect(1),toxic(),'An existing Protect streak further reduces survival probability'),
 make('protect-three',protect(),toxic({hp:300,effects:{toxic_counter:2}}),'Three fresh Protect successes required against a longer Toxic clock'),
 make('heal-instead',mon('Mew',['Recover','Protect'],{hp:1}),toxic(),'Healing avoids gambling on consecutive Protect'),
 make('lum-cure',protect(),toxic({hp:300,item:'Lum Berry',effects:{toxic_counter:2}}),'A status cure removes the promised Toxic win'),
 make('poison-heal',protect(),toxic({hp:300,ability:'Poison Heal',effects:{toxic_counter:2}}),'Poison Heal makes waiting for Toxic a losing strategy'),
];
