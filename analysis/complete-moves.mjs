// Public compatibility facade: native mechanics and one evaluation entry.
export * from './native-battle.mjs';
import {evaluatePosition} from './position-evaluator.mjs';
export function simulateCompleteMoves(snapshot,options={}){
 return evaluatePosition({snapshot},options);
}
