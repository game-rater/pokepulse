// Run & Bun 1.07 only. Offsets checked with the fingerprinted ROM and isolated
// native move execution; public expansion layouts are reference, not offsets.
export const effectLayout={disable:0x23668,disableStride:40,status3:0x23648,
 sideTimers:0x23618,sideStride:24,fieldTimers:0x23a5c,weatherTimer:0x23954,
 lastMoves:0x235cc,lastUsedMove:0x235f4,lockedMoves:0x235ec,takenDamage:0x23580,
 battleStructPointer:0x23a0c,resourcesPointer:0x23a18,choiceOffset:0xd8,
 futureCounter:0x237cc,futureSource:0x237d0,futureMons:0x237d4,
 futureMoves:0x23944,wishCounter:0x2394c,wishParty:0x23950};
export const nativeVolatiles=new Set(['flinch','uproar','bide','lockedmove','partiallytrapped','powder','attract',
 'focusenergy','rage','substitute','destinybond','trapped','nightmare','curse','foresight','defensecurl','torment',
 'leechseed','lockon','perishsong','minimize','charge','ingrain','yawn','imprison','grudge','gastroacid',
 'embargo','smackdown','telekinesis','miracleeye','magnetrise','healblock','aquaring','laserfocus','powertrick',
 'stockpile','throatchop','noretreat','tarshot','octolock','truant','slowstart','rollout','iceball']);
export const nativeSideConditions=new Set(['reflect','lightscreen','mist','safeguard','tailwind','auroraveil','luckychant','retaliate',
 'spikes','toxicspikes','stealthrock','stickyweb']);
export const nativeFieldConditions=new Set(['magicroom','wonderroom','mudsport','watersport','gravity','fairylock','iondeluge']);
const types=['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel',null,'Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark','Fairy'];
function pointer(ram,address,size){const p=ram.readUInt32LE(address);return p>=0x02000000&&p+size<=0x02040000?p-0x02000000:null;}
export function decodeLiveEffects(ram,index,maps,{status,status2,fieldFlags,weather,ability,item,moves,positions}){
 const l=effectLayout,d=l.disable+index*l.disableStride,s3=ram.readUInt32LE(l.status3+index*4),e={},v={},unknown=[];
 const add=(id,props={})=>{v[id]={...props};};
 const moveAt=a=>{const n=ram.readUInt16LE(a);return n&&n!==65535?maps.move[n]:undefined;};
 const duration=(id,offset)=>{const n=ram[d+offset];if(n)add(id,{duration:n});else unknown.push(`${id} counter is inconsistent`);};
 const last=moveAt(l.lastMoves+index*2);if(last)e.last_move=last;
 const battleLast=moveAt(l.lastUsedMove);if(battleLast)e.battle_last_move=battleLast;
 // Zero / 0xffff means no successful previous move, not an unread history.
 e.move_history_known=true;e.first_turn=!!ram[d+25];
 e.types=[...new Set([types[ram[0x233fc+index*92+34]],types[ram[0x233fc+index*92+35]]].filter(Boolean))];
 if(!e.types.length)delete e.types;
 if(status==='tox')e.toxic_counter=(ram.readUInt32LE(0x233fc+index*92+80)>>>8)&15;
 if(status2&8)add('flinch');
 if(status2&0x70)add('uproar',{duration:(status2>>>4)&7});
 if(status2&0x300)add('bide',{duration:(status2>>>8)&3,totalDamage:ram.readUInt32LE(l.takenDamage+index*4),source:'foe'});
 const locked=moveAt(l.lockedMoves+index*2);
 if(status2&0xc00){if(locked){e.rampage_move=locked;e.rampage_turns=(status2>>>10)&3;
  add('lockedmove',{move:locked,duration:2,trueDuration:e.rampage_turns});}else unknown.push('locked move is unavailable');}
 if(status2&0x1000&&!v.bide&&!v.lockedmove&&!v.uproar){
  if(locked){if(['Rollout','Ice Ball'].includes(locked)){
   const left=ram[d+20]&15;e.rolling_move=locked;e.rolling_hits=5-left;
   add(locked==='Rollout'?'rollout':'iceball',{duration:1,hitCount:5-left,contactHitCount:5-left});
  }else e.charging_move=locked;}else unknown.push('multi-turn move is unavailable');
 }
 if(status2&0x2000){e.trap_turns=ram[d+37];
  const bs=pointer(ram,l.battleStructPointer,0xe0),binding=bs===null?undefined:moveAt(bs+4+index*2);
  if(e.trap_turns&&binding)add('partiallytrapped',{duration:e.trap_turns,source:'foe',sourceEffect:binding,boundDivisor:8});
  else unknown.push('binding move or duration is unavailable');
 }
 if(status2&0x4000)add('powder',{source:'foe'});
 if(status2&0xf0000)add('attract',{source:'foe'});
 for(const [mask,id,key] of [[0x100000,'focusenergy','focus_energy'],[0x800000,'rage'],[0x2000000,'destinybond'],
  [0x4000000,'trapped'],[0x8000000,'nightmare'],[0x10000000,'curse'],[0x20000000,'foresight','foresight'],
  [0x40000000,'defensecurl','defense_curl'],[0x80000000,'torment']])if(status2&mask){add(id,{source:['curse','trapped','nightmare'].includes(id)?'foe':'self'});if(key)e[key]=true;}
 if(status2&0x200000)e.transformed=true;
 if(status2&0x400000)e.recharge=true;
 if(status2&0x1000000){e.substitute_hp=ram[d+14];if(!e.substitute_hp)unknown.push('Substitute HP is inconsistent');}
 if(s3&4){e.leech_seed=true;add('leechseed',{source:'foe'});}
 if(s3&0x18)add('lockon',{duration:(s3>>>3)&3,source:'foe'});
 if(s3&0x20)add('perishsong',{duration:(ram[d+18]&15)+1});
 for(const [mask,id] of [[0x100,'minimize'],[0x400,'ingrain'],[0x2000,'imprison'],[0x4000,'grudge'],
  [0x10000,'gastroacid'],[0x200000,'smackdown'],[0x2000000,'miracleeye'],[0x10000000,'aquaring'],[0x40000000,'powertrick']])if(s3&mask)add(id);
 if(s3&0x200)add('charge',{duration:ram[d+21]&15});
 if(s3&0x1800)add('yawn',{duration:(s3>>>11)&3,source:'foe'});
 for(const [mask,id,offset] of [[0x20000,'embargo',30],[0x800000,'telekinesis',32],[0x4000000,'magnetrise',31],
  [0x8000000,'healblock',33],[0x20000000,'laserfocus',34]])if(s3&mask)duration(id,offset);
 if(s3&0x40)e.semi_invulnerable='air';if(s3&0x80)e.semi_invulnerable='underground';
 if(s3&0x40000)e.semi_invulnerable='underwater';if(s3&0x1000000)e.semi_invulnerable='vanished';
 if(ram[d+9])add('stockpile',{layers:ram[d+9],def:-ram.readInt8(d+10),spd:-ram.readInt8(d+11)});
 e.used_moves=moves.filter((move,slot)=>ram[d+36]&(1<<slot));
 if(ram[d+28])e.autotomize_count=ram[d+28];
 if(ram[d+35])duration('throatchop',35);
 for(const [mask,id] of [[1,'noretreat'],[2,'tarshot'],[4,'octolock']])if(ram[d+38]&mask)add(id,{source:id==='octolock'?'foe':'self'});
 if(ability==='Truant')e.truant_loafing=!!(ram[d+26]&1);
 if(ability==='Slow Start')e.slow_start_turns=ram[d+29];
 const bs=pointer(ram,l.battleStructPointer,0xe0);
 if(bs!==null&&(['Choice Band','Choice Specs','Choice Scarf'].includes(item)||ability==='Gorilla Tactics')){
  const choice=moveAt(bs+l.choiceOffset+index*2);if(choice&&moves.includes(choice))e.locked_move=choice;
 }
 if(bs!==null&&bs+0x2fa+index<0x40000&&ram[bs+0x2fa+index])e.micle_boost=true;
 const resources=pointer(ram,l.resourcesPointer,8),flags=resources===null?null:pointer(ram,resources+4,16);
 if(flags!==null){const n=ram.readUInt32LE(flags+index*4);e.flash_fire=!!(n&1);e.unburden=!!(n&4);}
 else if(['Flash Fire','Unburden'].includes(ability))unknown.push('ability activation flags are unavailable');
 const side=(positions[index]&1),t=l.sideTimers+side*l.sideStride,sideFlags=ram.readUInt32LE(0x23610+side*4),sc={};
 for(const [mask,id,offset,key] of [[1,'reflect',0,'reflect_turns'],[2,'lightscreen',2,'light_screen_turns'],[0x20,'safeguard',6],
  [0x100,'mist',4],[0x400,'tailwind',15,'tailwind_turns'],[0x800,'auroraveil',13],[0x1000,'luckychant',17]])if(sideFlags&mask){
  const n=ram[t+offset];if(n){sc[id]={duration:n};if(key)e[key]=n;}else unknown.push(`${id} counter is inconsistent`);
 }
 for(const [mask,id,offset] of [[0x10,'spikes',10],[0x2000,'toxicspikes',11],[0x4000,'stealthrock',12]])if(sideFlags&mask)sc[id]={layers:ram[t+offset]||1};
 if(sideFlags&4)sc.stickyweb={layers:1};
 if(ram[t+19])sc.retaliate={duration:ram[t+19]};
 const fc={};for(const [mask,id,offset] of [[1,'magicroom',3],[4,'wonderroom',2],[8,'mudsport',0],[16,'watersport',1],[32,'gravity',6],[0x800,'fairylock',7]])if(fieldFlags&mask){
  const n=ram[l.fieldTimers+offset];if(n)fc[id]={duration:n};else unknown.push(`${id} counter is inconsistent`);
 }
 if(fieldFlags&0x400)fc.iondeluge={duration:1};
 if(fieldFlags&2)e.trick_room_turns=ram[l.fieldTimers+4]||null;
 if(fieldFlags&0x3c0)e.terrain_turns=fieldFlags&0x1000?-1:ram[l.fieldTimers+5]||null;
 if(weather)e.weather_turns=ram[l.weatherTimer]||-1;
 const wish=ram[l.wishCounter+index];if(wish){const party=side?0x23cf0:0x23a98,slot=ram[l.wishParty+index];
  e.pending_wish={turns:wish,hp:slot<6?Math.floor(ram.readUInt16LE(party+slot*100+88)/2):0};}
 const future=ram[l.futureCounter+index];if(future){const source=ram[l.futureSource+index];
  e.pending_future={turns:future,move:moveAt(l.futureMoves+index*2),source,mon_offset:l.futureMons+index*92};}
 // Unused/transient engine bookkeeping does not add a turn-long effect.
 if(status2&0x8080)unknown.push('unrecognized volatile status bits');
 if(s3&0x80008000)unknown.push('unrecognized extended status bits');
 if(fieldFlags&~0x1fff)unknown.push('unrecognized field flags');
 if(Object.keys(v).length)e.native_volatiles=v;if(Object.keys(sc).length)e.native_side_conditions=sc;if(Object.keys(fc).length)e.native_field_conditions=fc;
 return {effects:e,unknown};
}
