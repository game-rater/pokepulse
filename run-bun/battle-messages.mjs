// Run & Bun 1.07 print-controller messages, not predictions or an AI policy.
// The critical print path at 0x080573f0 reads the crit flag at 0x0202359a,
// tests move-result flags at 0x02023602, and prints string 217. Controller
// buffer 1 (0x02000620) was checked against a native critical-hit replay.
export const messageLayout={resourcesPointer:0x23a18,buffers:0x24,stride:0x200,controllerFlags:0x233e0,attacker:0x23594,target:0x23595,currentMove:0x23572,crit:0x2359a,resultFlags:0x23602};
export const messageKinds=new Map([
 [-1,['hp-change','target']],
 [4,['move-used','attacker']], [217,['critical-hit','attacker']], [23,['miss','attacker']],
 [345,['avoided','attacker']], [57,['paralyzed','attacker']], [74,['flinched','attacker']],
 [230,['confusion-self-hit','attacker']], [107,['asleep','attacker']], [51,['frozen','attacker']],
 [42,['poison-damage','attacker']], [48,['burn-damage','attacker']], [24,['protected','target']],
 [108,['woke-up','attacker']], [153,['endured','target']], [303,['survived-item','target']],
]);
export function readMessageObservations(ram){
 const l=messageLayout,active=ram.readUInt32LE(l.controllerFlags),rows=[];
 if(!(ram[0x426f9]&2)||ram[0x233e4]!==2)return rows;
 const resources=ram.readUInt32LE(l.resourcesPointer)-0x02000000;
 if(resources<0||resources+l.buffers+4*l.stride>0x40000)return rows;
 for(let controller=0;controller<2;controller++){
  const base=resources+l.buffers+controller*l.stride;if(!(active&(1<<controller))||ram[base]!==16)continue;
  const code=ram.readUInt16LE(base+2);if(code>1024)continue;
  const attacker=ram[l.attacker],target=ram[l.target];if(attacker>1||target>1)continue;
  rows.push({controller,code,move:ram.readUInt16LE(base+4),attacker,target,turn:ram[0x45d23],
   player_index:[...ram.subarray(0x233ee,0x233f0)].findIndex(p=>(p&1)===0),
   hp:[0,1].map(i=>ram.readUInt16LE(0x233fc+92*i+42)),
   species:[0,1].map(i=>ram.readUInt16LE(0x233fc+92*i)),
   // Stable while a message is displayed; returning to a different controller
   // command/acknowledgement re-arms the per-frame observer for a repeated hit.
   phase:ram.readUInt32LE(0x45d04),action_index:ram[0x233fa],token:ram.subarray(base,base+24).toString('hex')});
 }
 return rows;
}
export function decodeMessage(raw,maps){
 if(!raw||!Number.isInteger(raw.code)||raw.code< -1||raw.code>1024||![0,1].includes(raw.attacker)||![0,1].includes(raw.target)||![0,1].includes(raw.player_index)||!Number.isInteger(raw.turn)||raw.turn<0||raw.turn>255)return null;
 if(!Array.isArray(raw.hp)||raw.hp.length!==2||raw.hp.some(n=>!Number.isInteger(n)||n<0||n>999)||!Array.isArray(raw.species)||raw.species.length!==2)return null;
 const species=raw.species.map(n=>maps.mons[n-1]);if(species.some(n=>!n))return null;
 const [kind,subject]=messageKinds.get(raw.code)||['other-message','attacker'],actor=raw[subject],target=raw.target;
 if(kind==='hp-change'&&(!Number.isInteger(raw.before_hp)||raw.before_hp<0||raw.before_hp>999||raw.before_hp===raw.hp[actor]))return null;
 const move=maps.move[raw.move];if(['move-used','critical-hit','miss','avoided'].includes(kind)&&!move)return null;
 const side=i=>i===raw.player_index?'player':'opponent';
 return {kind,actor:side(actor),target:side(target),move:move||null,turn:raw.turn,
  actor_species:species[actor],target_species:species[target],actor_hp:raw.hp[actor],target_hp:raw.hp[target],
  player_hp:raw.hp[raw.player_index],opponent_hp:raw.hp[1-raw.player_index],
  phase:Number.isInteger(raw.phase)?raw.phase:null,action_index:Number.isInteger(raw.action_index)?raw.action_index:null,
  ...(kind==='hp-change'?{before_hp:raw.before_hp,after_hp:raw.hp[actor]}:{}),
  message_id:raw.code,evidence:kind==='hp-change'?'native-hp-change':'native-game-message'};
}
// A buffered per-frame journal survives captures skipped at fast-forward speed.
// Old integrations can still supply observed messages from their RAM packets.
export class MessageObserver {
 constructor(){this.session=null;this.last=0;this.prints=new Map();}
 observe(observations,maps,journal=null){
  if(journal){
   const valid=typeof journal.session==='string'&&journal.session.length>0&&journal.session.length<=100&&Array.isArray(journal.events)&&journal.events.length<=128&&journal.events.every(e=>Number.isSafeInteger(e.id)&&e.id>0);
   if(!valid)throw Error('Invalid battle message journal');
   if(this.session!==journal.session){this.session=journal.session;this.last=0;}
   const fresh=journal.events.filter(e=>e.id>this.last).sort((a,b)=>a.id-b.id),events=[];
   for(const raw of fresh){
    if(raw.id<=this.last)continue;
    if(raw.id>this.last+1)events.push({kind:'capture-gap',evidence:'message-journal-overflow',turn:raw.turn});
    const message=decodeMessage(raw,maps);
    events.push(message?{...message,event_id:raw.id}:{kind:'capture-gap',evidence:'invalid-message-observation',turn:raw.turn});
    this.last=raw.id;
   }
   this.prints.clear();return events;
  }
  const next=new Map(),events=[];
  for(const raw of observations){
   const key=JSON.stringify([raw.code,raw.move,raw.attacker,raw.target,raw.turn,raw.token]);next.set(raw.controller,key);
   if(this.prints.get(raw.controller)!==key){const message=decodeMessage(raw,maps);if(message)events.push(message);}
  }
  this.prints=next;return events;
 }
}
