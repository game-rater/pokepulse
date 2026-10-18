// Public compatibility facade; search implementations do not own routing.
export * from './sampled-search.mjs';
import {evaluatePosition} from './position-evaluator.mjs';
export function simulateSampledMoves(initial,options,reasons){
 return evaluatePosition({state:initial,reasons,strategy:'sampled'},options);
}
