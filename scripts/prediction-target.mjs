// Development goal, not a certificate or a universal latency guarantee.
export const INITIAL_ESTIMATE_TARGET_MS=300;
export const INITIAL_ESTIMATE_ERROR_PP=10;
export const validProbability=n=>Number.isFinite(n)&&n>=0&&n<=100;
export function assessInitialEstimate(readings,expected,{deadlineMs=INITIAL_ESTIMATE_TARGET_MS}={}){
 const reading=readings.filter(r=>validProbability(r.score)&&Number.isFinite(r.elapsed_ms)&&r.elapsed_ms>=0&&r.elapsed_ms<deadlineMs).at(-1);
 const error=reading&&validProbability(expected)?Math.abs(reading.score-expected):null;
 return {deadline_ms:deadlineMs,score:reading?.score??null,available_at_ms:reading?.elapsed_ms??null,
  absolute_error_pp:error,reference:expected??null,goal_met:validProbability(expected)?!!reading&&error<=INITIAL_ESTIMATE_ERROR_PP:null};
}
