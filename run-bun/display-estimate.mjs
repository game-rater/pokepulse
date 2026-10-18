// A zero lower bound in a wide interval is unfinished work, not a zero chance.
export function displayEstimate(result,previous=null){
  const {lower_bound:lower,upper_bound:upper,unresolved}=result.outlook;
  if(result.outlook.provisional_usable&&Number.isFinite(result.outlook.provisional_score))return {score:result.outlook.provisional_score,kind:'simulation-estimate'};
  if(upper-lower>=100-1e-8)return {score:null,kind:'awaiting-informative-bounds'};
  if(unresolved<=0.002)return {
    score:result.victory,kind:'certified-lower-bound'
  };
  if(Number.isFinite(result.outlook.provisional_score))return {
    score:Math.max(lower,Math.min(upper,result.outlook.provisional_score)),kind:'weighted-frontier-estimate'
  };
  // A completely unknown interval contains no new estimate to animate toward.
  // Refinement alone must not slide the display down as an upper bound shrinks.
  // Keep the current provisional point while the tightened interval permits it.
  if(Number.isFinite(previous))return {score:Math.max(lower,Math.min(upper,previous)),kind:'held-estimate-within-current-bounds'};
  // This is a provisional display estimate, not a certified win probability.
  // Certified bounds remain separate in the API throughout refinement.
  return {score:(lower+upper)/2,kind:'interval-midpoint-estimate'};
}
