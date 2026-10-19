// Pure heuristic scoring of measured capabilities and finite resources.
// This module neither executes mechanics nor owns caches.
export function scoreTemporalFeatures({sides:mon,actions,passive,trickRoom}){
 const lifetime=actions.map((a,i)=>{
  const p=mon[i],incoming=actions[1-i].attack,healing=Math.max(0,passive.net[i]);
  const loss=Math.max(0,-passive.net[i],Number.isFinite(passive.clock[i])?p.hp/passive.clock[i]:0);
  const safeBlocks=Math.min(a.protectPP,a.otherPP+(p.stall?0:1));
  const reserve=p.hp+p.substituteHP+a.healing+passive.burst[i]+safeBlocks*incoming;
  const drain=incoming+loss-healing;
  const recoilDrain=Math.max(1,a.recoil+loss-healing);
  const resourceLimit=a.pp+Math.ceil(p.maxhp/recoilDrain);
  const survival=drain>0?reserve/drain:Infinity;
  const sleep=p.sleep;
  return {turns:Math.max(0.1,Math.min(survival,resourceLimit)-sleep),stable:incoming+loss<=healing&&Math.max(incoming,actions[1-i].futureAttack)+loss<=healing,resources:a.pp};
 });
 const speed=mon[0].speed-mon[1].speed;
 const initiative=(speed===0?0:speed>0?1:-1)*(trickRoom?-1:1)*0.1;
 let value=1/(1+Math.exp(-3.5*(Math.log1p(lifetime[0].turns)-Math.log1p(lifetime[1].turns))-initiative));
 if(lifetime[0].stable&&!lifetime[1].stable&&lifetime[0].resources>=lifetime[1].turns)value=0.98;
 if(lifetime[1].stable&&!lifetime[0].stable&&lifetime[1].resources>=lifetime[0].turns)value=0.02;
 return {value:Math.max(0.02,Math.min(0.98,value)),actions,passive,lifetime};
}
