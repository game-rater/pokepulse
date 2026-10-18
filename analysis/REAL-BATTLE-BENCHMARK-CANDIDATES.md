# Real battle candidates for prediction benchmarks

Research date: 2026-10-18. These are candidate scenarios, not measured slow cases or verified probability oracles. Sources describe Run & Bun battles and ordinary boss strategies; they do not establish encounter usage frequencies. Extract active matchups at known decision points. Do not add switch selection or doubles to these benchmarks.

## Sources

- [Lunatone vs Drednaw report, player build, and video timestamp](https://www.reddit.com/r/nuzlocke/comments/1nbdd25/rb_ai_help_why_hypnosis_over_fast_kill/).
- [Brawly planning discussion: Seadra, Monferno, and Scraggy](https://www.reddit.com/r/nuzlocke/comments/1w05j4s/run_n_bun_brawly_advice/).
- [Firsthand Brawly battle: missed Bubble Beam range and Rest recovery](https://www.reddit.com/r/nuzlocke/comments/1hj41jg/cinematic_rng_deathless_brawly_runandbun/).
- [Norman battle: deliberate Guts activation; discussion of Cinccino counters](https://www.reddit.com/r/nuzlocke/comments/1l8xjwf/deathless_norman/).
- [Completed run: Bulldoze against Zeraora and Knock Off against Rhyperior](https://www.reddit.com/r/PokemonHallOfFame/comments/12ywgl6/pok%C3%A9mon_run_and_bun_done/).
- [Brawly and Roxanne battle: Eldegoss against Carracosta](https://www.reddit.com/r/nuzlocke/comments/1uc2337/run_58_starts_off_deathless/).
- [Published community trainer sets, pinned source](https://github.com/SynchEleven/rnb-calc-ultimate/blob/15a0ea580604595786e0f81d965e68afc66279e4/src/js/data/sets/gen8.js). Retrieved file SHA256: `9b058c4b2eeb121002c4eef87e11e069a4c9dc71ad3bc8398d3e41f9b51b412a`. Community sets are not independent ROM verification.

## Ranked shortlist

The computation challenges below are engineering inferences from the reported strategies and published sets. Runtime difficulty must be measured.

| Priority | Active matchup | Documented basis | Why it can challenge prediction | Reconstruction status |
|---|---|---|---|---|
| 1 | Drednaw vs Roxanne's Lunatone | Full Drednaw build and Chesto Berry; both sides at -1 Speed; full-health Lunatone; video event at 4:09 | Damage rolls compete with Hypnosis; berry consumption changes later sleep value; super-effective attacks activate Weakness Policy and alter Stored Power; Icy Wind changes future order | Best source. Recover exact current HP, PP, counters and remaining state from the video; obtain opponent stats from version-matched data. |
| 2 | Monferno vs Brawly's Scraggy | Players disagree over when Low Sweep, Leer, and attacking beat Rest; firsthand report describes missing a KO range and allowing Rest | Rest, Shed Skin and Power-Up Punch change continuations; Rock Tomb changes order; best move depends on opponent choice and damage thresholds | Need player build and exact starting HP, boosts, PP and sleep state. Do not adopt commenters' claimed AI odds as truth. |
| 3 | Hariyama vs Norman's Porygon2 | Player deliberately accepts Thunder Wave to activate Guts | A harmful status can improve offense while introducing skipped turns and reduced Speed; Recover creates repeated decision cycles; damage/secondary-effect branches continue across turns | Player species identified in discussion, but complete build/HP absent. Reconstruct explicitly or label a public synthetic build. |
| 4 | Togedemaru vs Norman's Cinccino | Community identifies Togedemaru as a practical answer to Skill Link/King's Rock Cinccino | Multiple hits, accuracy, per-hit criticals, flinch, contact damage, and defensive choices create many outcome branches; speed matters | Strategy recommendation, not a fully specified replay. Need player build, moves, HP and first-turn history. |
| 5 | Seadra vs Brawly's Combusken | Firsthand missed Bubble Beam KO range; repeated advice calls this a conventional but risky matchup | Speed Boost changes order; Work Up competes with attacks; Thunder Punch punishes a nominal type advantage; Clear Smog creates a setup-control decision | Need exact build, current stats and turn state. Advice about Clear Smog is a candidate line, not an established optimal strategy. |
| 6 | Eldegoss vs Norman's Cinccino | Community discusses Cotton Down repeatedly dropping Cinccino's Speed | Multi-hit reactions alter later order; should correctly distinguish losing the present action to flinch from gaining a better following turn | Use only the active Cotton Down exchange. Exclude the suggested subsequent switch to Walrein. Player state remains to be specified. |
| 7 | Krokorok vs Wattson's Zeraora | Completed-run author reports using Bulldoze with Krokorok and Donphan to slow Zeraora | Shuca Berry changes the first Ground hit; speed control changes subsequent turns; Grass Knot and Close Combat provide competing attacks | Matchup family is documented, but individual HP/build/PP are not. Do not present an invented state as the actual replay. |
| 8 | Krookodile vs a Flannery-gym Rhyperior | Firsthand last-Pokemon duel includes Knock Off removing Leftovers | Immediate damage competes with removing future recovery; close damage rolls, crits and flinches can change a multi-turn race | Trainer identity, complete moves and exact HP/stats need recovery. Lower readiness than named gym-leader cases. |

An additional compact case is Eldegoss vs Roxanne's Carracosta. A player reports surviving two Aqua Jets and winning with two Leaf Tornadoes; the published set supplies Rindo Berry and Solid Rock. This can exercise priority and a consumed resistance berry without requiring a very long search. Player build and exact HP still need specification.

## Most complete player build found

The Lunatone report supplies Drednaw at level 25, Careful, Strong Jaw, Chesto Berry, with IVs HP 20 / Atk 17 / Def 16 / SpA 9 / SpD 26 / Spe 17 and moves Rock Tomb, Water Pulse, Bite, Ice Fang. It reports both sides at -1 Speed and Lunatone at full HP. It does not give Drednaw's exact current HP in the text. Its quoted approximately 37% Ancient Power KO chance is a player-reported calculator result, not a win-probability oracle.

## Building useful benchmark states

1. Pin the game version, opponent set source, player build, HP, PP, boosts, consumed items and relevant history. Use the record only for fields actually recoverable. Mark all constructed variations synthetic.
2. Start with the documented decision state. Add nearby HP states around a KO boundary, and observed successor states after a hit/status/item trigger. Keep plausible ordinary builds rather than tuning exotic interactions solely to overwhelm the engine.
3. Run each case in both opponent models where supported. Report their values separately; a minimax prediction and an NPC-policy prediction answer different questions. A community claim that an AI move is guaranteed is not a reference policy.
4. Measure first usable result, score available by 1 second, refinement at 3 and 10 seconds, longest pass, CPU, memory, and time to reuse a successor state. Include cold worker startup separately from warmed engine timing.
5. Build accuracy references from an independently checked small exact model where tractable. For larger cases, report the reference method and uncertainty; a long run of the same approximate engine is not ground truth, and a single recorded victory is not a probability.
6. Retain both strategically hard cases and compact controls. A hard fight is not necessarily expensive computationally, and a fast numeric answer is not necessarily accurate.

The first implementation batch now lives in `scripts/real-battle-fixtures.mjs`: Drednaw/Lunatone, Monferno/Scraggy, Hariyama/Porygon2, and Togedemaru/Cinccino, with three independently constructed states per family. `test/real-battle-fixtures.test.mjs` checks provenance, distinct states, native hydration and phase markers. These are explicitly synthetic reconstructions and have no independent probability oracle. See `SEARCH-BENCHMARKS.md` for reproducible run commands.
