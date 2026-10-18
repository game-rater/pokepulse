import {predictionEstimate} from '../analysis/result-contract.mjs';
// Compatibility adapter: display and publication share certainty rules.
export function displayEstimate(result,previous=null){return predictionEstimate(result.outlook,previous);}
