// Local, reproducible corrections to the pinned community implementation.
// Match exact source fragments so an upstream update cannot silently skip one.
export const npcAiPatches=[
 'Read Corrosion, Merciless and Rest recovery abilities from the attacker',
 'Use weather-dependent recovery fractions and score Shore Up',
 'Keep fixed three-hit moves at three hits with Skill Link',
 'Reject stat-drop bonuses when an attack deals no damage',
 'Use supplied next toxic stage and residual-damage immunity for Protect',
 'Apply Psychic Terrain priority penalties only to grounded targets'
];
export function patchNpcAi(source){
 const replace=(old,next)=>{if(!source.includes(old))throw Error('NPC AI import fragment changed: '+old.slice(0,80));source=source.replace(old,next);};
 source=source.replaceAll('moves[0].ability','aiAbility');
 replace('return move.ability == "Skill Link" ? 5 : 3;', 'return isNamed(move.name, "Surging Strikes", "Triple Dive") ? 3 : move.ability == "Skill Link" ? 5 : 3;');
 replace('"Breaking Swipe") && moveScore == 0)', '"Breaking Swipe") && moveScore == 0 && anyValidDamageRolls)');
 replace('move.priority > 0 && terrain == "Psychic"','moveHasPriority && terrain == "Psychic" && aiOptions["playerGroundedAiOpt"]');
 replace('Math.trunc(maxHP / 16) * toxCounter','Math.max(1, Math.trunc(maxHP / 16)) * toxCounter');
 replace('let weatherDamage = 0;', 'if (ability === "Magic Guard" || ability === "Poison Heal" && (status === "psn" || status === "tox")) statusDamage = 0;\n    let weatherDamage = 0;');
 const start=source.indexOf('            // TODO: tabled for now, needs some funky solution');
 const end=source.indexOf('            // Rest',start);
 if(start<0||end<0)throw Error('NPC recovery block changed');
 source=source.slice(0,start)+`            // Recovery scores use the actual healing fraction for this field.
            if (isNamed(moveName, "Recover", "Slack Off", "Heal Order", "Soft-Boiled", "Roost", "Strength Sap", "Morning Sun", "Synthesis", "Moonlight", "Shore Up")) {
                let recoveryFraction = 0.5;
                if (isNamed(moveName, "Morning Sun", "Synthesis", "Moonlight")) {
                    recoveryFraction = weather === "Sun" ? 2 / 3 : weather && weather !== "Strong Winds" ? 1 / 4 : 1 / 2;
                } else if (moveName === "Shore Up" && weather === "Sand") recoveryFraction = 2 / 3;
                if (aiHealthPercentage === 100 || aiHealthPercentage >= 85) {
                    moveStringsToAdd.push({move:moveName,score:aiHealthPercentage === 100 ? -20 : -6,rate:1});
                } else {
                    const recoverRate = shouldAIRecover(moves[0].attacker, recoveryFraction, playerHighestRoll, aiFaster);
                    moveStringsToAdd.push({move:moveName,score:5,rate:1},{move:moveName,score:2,rate:recoverRate});
                }
            }

`+source.slice(end);
 return source;
}
