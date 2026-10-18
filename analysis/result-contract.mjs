// Certainty describes the search model, not verified parity with the ROM.
// Finishing a sampling budget never creates a mathematical certificate.
export function classifyForecast(outlook={}) {
  const lower=outlook.lower_bound,upper=outlook.upper_bound;
  const valid=Number.isFinite(lower)&&Number.isFinite(upper)&&lower>=0&&upper<=100&&lower<=upper;
  const certificate=!outlook.input_blocked&&!outlook.approximate&&outlook.certified!==false&&valid
    ? {lower,upper,width:upper-lower}:null;
  const proven=certificate&&certificate.width<=1e-8;
  const resolved=!!certificate&&!!outlook.complete;
  const status=outlook.input_blocked?'blocked':proven?'proven':resolved?'resolved':
    outlook.search_paused?'paused':outlook.sampling_complete?'sample-budget-finished':'searching';
  return {schema_version:1,kind:outlook.input_blocked?'blocked':proven?'proven':certificate?'bounded':outlook.approximate?'estimate':'unavailable',
    certificate,search:{status,resolved:!!(proven||resolved)},reasons:[...(outlook.unresolved_reasons||[])]};
}
export function hasResolvedCertificate(result){return classifyForecast(result?.outlook).search.resolved;}
export function predictionEstimate(outlook={},previous=null){
  const certainty=classifyForecast(outlook),certificate=certainty.certificate;
  if(outlook.input_blocked)return {score:null,kind:'missing-input'};
  if(certainty.kind==='proven')return {score:certificate.lower,kind:'proven-value'};
  const point=Number.isFinite(outlook.provisional_score)?outlook.provisional_score:null;
  if(outlook.approximate)return outlook.provisional_usable&&point!==null
    ? {score:Math.max(0,Math.min(100,point)),kind:'simulation-estimate'}:{score:null,kind:'awaiting-simulation-estimate'};
  if(!certificate)return {score:null,kind:'awaiting-valid-bounds'};
  const {lower,upper,width}=certificate;
  if(width>=100-1e-8)return {score:null,kind:'awaiting-informative-bounds'};
  if(width<=0.2)return {score:lower,kind:'certified-lower-bound'};
  if(point!==null)return {score:Math.max(lower,Math.min(upper,point)),kind:'weighted-frontier-estimate'};
  if(Number.isFinite(previous))return {score:Math.max(lower,Math.min(upper,previous)),kind:'held-estimate-within-current-bounds'};
  return {score:(lower+upper)/2,kind:'interval-midpoint-estimate'};
}
export function predictionReport(outlook,previous=null){
  const report=classifyForecast(outlook),estimate=predictionEstimate(outlook,previous);
  return {...report,estimate:{score:estimate.score,basis:estimate.kind}};
}
