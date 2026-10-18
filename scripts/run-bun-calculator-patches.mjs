export const calculatorPatches=['Magma Armor prevents critical damage','Gale Wings applies at every HP value','Triage adds three priority stages','Stateful forecasts skip entry effects already represented in observed stat stages'];
export function guardEntryEffects(source){
  return source.replace(/^(\s*)\(0, util_2\.(checkSeedBoost|checkDauntlessShield|checkDownload|checkIntrepidSword)\)\((attacker|defender),([^\n]+);/gm,(_,indent,fn,mon,args)=>`${indent}if (!${mon}.skipEntryEffects) (0, util_2.${fn})(${mon},${args};`);
}
export function patchCalculator(source){
  const armor="defender.hasAbility('Battle Armor', 'Shell Armor')";
  const priority="(attacker.hasAbility('Gale Wings') &&\n            move.hasType('Flying') &&\n            attacker.curHP() === attacker.maxHP())) {\n        move.priority = 1;";
  const normalized=source.replace(/\r\n/g,'\n');
  if(!normalized.includes(armor)||!normalized.includes(priority))throw Error('Calculator source changed: review the Run & Bun armor/priority patches before importing.');
  return guardEntryEffects(normalized.replace(armor,"defender.hasAbility('Battle Armor', 'Shell Armor', 'Magma Armor')")
    .replace(priority,"(attacker.hasAbility('Gale Wings') && move.hasType('Flying'))) {\n        move.priority += attacker.hasAbility('Triage') ? 3 : 1;"));
}
