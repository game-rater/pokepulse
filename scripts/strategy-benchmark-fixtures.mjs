import {referenceMon as mon} from './accuracy-benchmark-fixtures.mjs';
function fixture(id,player,opponent,description){return {id:'strategy-'+id,group:'strategy',oracle:'strategy',description,
 provenance:{kind:'independent-enumeration',notes:'Synthetic active-pair controls; calculator damage distributions and independent finite HP/PP dynamic programming, not recorded battles.'},snapshot:{player,opponent,field:{}}};}
export const strategyFixtures=[
 ...[1,35,70].map(hp=>fixture('recover-'+hp,mon('Mew',['Recover','Seismic Toss'],{level:20,hp}),
  mon('Machamp',['Strength'],{level:30,ability:'Steadfast',status:'tox',effects:{toxic_counter:2}}),'Recover or attack while ordinary random damage races a toxic clock')),
 ...[35,90,120].map(hp=>fixture('setup-'+hp,mon('Mew',['Swords Dance','Tackle'],{level:20,hp:41}),
  mon('Blissey',['Seismic Toss'],{level:20,hp}),'Spend an attack opportunity on Swords Dance or attack immediately')),
 fixture('setup-too-late',mon('Mew',['Swords Dance','Tackle'],{level:20,hp:1}),mon('Blissey',['Seismic Toss'],{level:20,hp:35}),'Setup loses immediately; only an immediate critical attack wins'),
];
