// Independent finite-horizon reference solver for a restricted race: player
// acts first, enemy retaliation is fixed damage, no residuals/items/status or
// enemy choices. Moves have independent, explicitly supplied damage outcomes.
// This is a benchmark oracle/prototype, not a general Pokemon engine.
export function solveDamageRace({playerHP,opponentHP,retaliation,moves}){
 if(![playerHP,opponentHP,retaliation].every(n=>Number.isInteger(n)&&n>0)||!moves.length)throw Error('Invalid race');
 for(const move of moves){
  if(Math.abs(move.outcomes.reduce((s,o)=>s+o.probability,0)-1)>1e-12||move.outcomes.some(o=>!Number.isInteger(o.damage)||o.damage<0||!(o.probability>=0&&o.probability<=1)))throw Error('Invalid probability distribution');
 }
 const cache=new Map();let branches=0,merged=0;
 const solve=(hp,target)=>{
  if(target<=0)return 1;if(hp<=0)return 0;
  const key=hp+':'+target;if(cache.has(key))return cache.get(key).value;
  const values=moves.map(move=>{
   // Combine identical successors before evaluating a continuation. A terminal
   // KO is one successor regardless of the exact excess damage or critical.
   const successors=new Map();
   for(const o of move.outcomes){const next=Math.max(0,target-o.damage);if(successors.has(next))merged++;successors.set(next,(successors.get(next)||0)+o.probability);}
   let value=0;for(const [target,probability] of successors){branches++;value+=probability*solve(hp-retaliation,target);}return value;
  });
  const value=Math.max(...values);cache.set(key,{value,values});return value;
 };
 const value=solve(playerHP,opponentHP);
 return {expected_percent:value*100,root_action_values:cache.get(playerHP+':'+opponentHP).values.map(v=>v*100),states:cache.size,branches,merged};
}
