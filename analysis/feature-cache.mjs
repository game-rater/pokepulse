// Worker-local feature memo tables. Mechanics metadata uses a weak memo in
// feature-probe-reuse; native battle objects are never retained here.
export const featureCaches={values:new Map(),profiles:new Map(),damageProbes:new Map()};
