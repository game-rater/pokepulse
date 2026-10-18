export function mixHit(normal,critical,chance){
  const result=new Map();
  for(const [rolls,weight] of [[normal,1-chance],[critical,chance]])for(const damage of rolls){
    if(weight)result.set(damage,(result.get(damage)||0)+weight/rolls.length);
  }
  return [...result].map(([damage,probability])=>({damage,probability}));
}
export function convolveHits(hits){
  let sums=new Map([[0,1]]);
  for(const hit of hits){const next=new Map();for(const [sum,p] of sums)for(const roll of hit){
    const damage=sum+roll.damage;next.set(damage,(next.get(damage)||0)+p*roll.probability);
  }sums=next;}
  return [...sums].map(([damage,probability])=>({damage,probability}));
}
export function hitCounts(multihit,ability,fallback=1){
  if(Array.isArray(multihit))return ability==='Skill Link'?[{count:multihit[1],probability:1}]:
    multihit[0]===2&&multihit[1]===5?[{count:2,probability:0.35},{count:3,probability:0.35},{count:4,probability:0.15},{count:5,probability:0.15}]:
    Array.from({length:multihit[1]-multihit[0]+1},(_,i)=>({count:multihit[0]+i,probability:1/(multihit[1]-multihit[0]+1)}));
  return [{count:typeof multihit==='number'?multihit:fallback,probability:1}];
}
