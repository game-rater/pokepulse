# Broader strategy survey

Research date: 2026-10-21. **Implementation update:** all 72 entries below now
map to runtime patterns through `surveyStrategyCoverage` in
`strategy-expansions.mjs`. The registry contains 108 families: the original 40
plus 68 new patterns. Five survey entries reuse enhanced existing patterns;
one entry has two new patterns. Tests cover every added family, native-turn
transitions and counterexamples. These remain candidate ordering hints, not
certified outcome claims. Scope exclusions below are still excluded.

The table's Gap/Partial labels record the **pre-implementation audit**, when
the runtime contained 40 families. Search across
Smogon's authored strategy analyses, articles, and set discussions covered
sleep, disruption, residual damage, recovery, items, abilities, field effects,
survival, retaliation, and resource exhaustion. Old-generation sources supply
ideas; their numbers, durations, legality and metagame advice are not Run & Bun
rules. Native metadata presence is audited below, not complete battle behavior
or species learnset legality. No trainer AI assumptions are required.

There are 72 additional **candidate entries** below, not 72 independent new
strategy families. Historically, `Partial` meant an existing ordering family
captured a piece of the sequence; `Gap` meant no dedicated pattern existed.
Neither label says whether the native battle simulator implements the moves.
`P1` prioritizes general matchup coverage; `P2` covers narrower conditions.
Sources document the combination or its components. Rows marked **inference**
are proposed combinations inferred from those components, not claimed published
sets. Candidate eligibility never establishes a win or permits pruning replies.

## Sleep, denial and move restriction

| ID | Candidate (priority; registry coverage) | Moves to audit | Conditions and counterplay to retain | Evidence |
| --- | --- | --- | --- | --- |
| R01 | Sleep -> Focus Punch (P1; Partial: substitute-focus-punch only) | `spore`, `focuspunch` | Sleep must survive until the opponent's action; wake-up and damaging replies can interrupt the punch. | [Breloom SubPunch][breloom] |
| R02 | Sleep -> Nightmare (P2; Gap) | `hypnosis`, `nightmare` | Sleeping target, Nightmare absent, remaining sleep duration; waking removes the clock. | [Hypno][hypno] |
| R03 | Sleep -> wait/heal with Bad Dreams (P2; Gap) | `darkvoid`, `protect` | User actually has Bad Dreams; sleep and residual immunity checks; Dark Void user restrictions. The Protect extension is an inference. | [Darkrai][darkrai] |
| R04 | Yawn -> Protect -> exploit sleep (P1; Gap) | `yawn`, `protect` | Pending Yawn must still resolve; status, terrain, abilities, cure items and timing can prevent sleep. Inference from Yawn and protection components. | [Vaporeon][vaporeon] |
| R05 | Paralysis -> flinching attack (P1; Gap) | `thunderwave`, `bodyslam`, `ironhead`, `airslash` | Must act first for flinch; immunity, Serene Grace and secondary-effect prevention change branches. | [Jirachi][jirachi], [1v1 archetypes][archetypes] |
| R06 | Paralysis -> confusion -> attack (P2; Gap) | `thunderwave`, `confuseray`, `thunderbolt` | Independent action checks, finite confusion duration, status immunities; use current-generation rates. | [Lanturn parafusion][lanturn] |
| R07 | Encore -> setup (P1; Gap) | `encore`, `poweruppunch` | Observed last move is repeatable and non-threatening; Encore timing and expiration matter. Never assume the opponent voluntarily repeats it. | [Lopunny][lopunny] |
| R08 | Encore -> Disable (P1; Gap) | `encore`, `disable` | Need last-move identity, both timers, PP and legal action recomputation; native restrictions determine Struggle. | [Gengar set discussion][gengar-discussion], [restriction guide][restrictions] |
| R09 | Substitute -> Disable -> attack (P1; Gap) | `substitute`, `disable`, `shadowball` | Requires a real observed attack to disable, sufficient Substitute HP and usable follow-up. Sound/Infiltrator and multiple coverage attacks remain replies. | [SubDisable Gengar][annoying] |
| R10 | Torment -> Substitute/Protect loop (P1; Gap) | `torment`, `substitute`, `protect` | Track last move and alternating restriction; opponent may have multiple damaging moves. Full loop must pay HP and PP costs. | [Torment Heatran][torment] |
| R11 | Taunt -> Toxic -> sustain (P1; Gap) | `taunt`, `toxic`, `recover` | Prevent actual recovery/status options only while Taunt lasts; immunity, faster Taunt, and damaging counterplay remain. Generalization of stallbreaking components. | [Heatran][heatran], [Whimsicott][whimsicott] |
| R12 | Trick/Switcheroo a Choice item -> exploit lock (P1; Gap) | `trick`, `switcheroo`, `willowisp` | Transfer must succeed; identify held item and locked move; Sticky Hold, unremovable items and item suppression matter. | [Choice Trick Rotom][rotom] |
| R13 | Trick Lagging Tail -> move first (P2; Gap) | `trick`, `recover` | Successful transfer changes order within a priority bracket; does not reverse priority. Recovery follow-up is an inference. | [Sableye][sableye] |

## Residual damage, healing and resource loops

| ID | Candidate (priority; registry coverage) | Moves to audit | Conditions and counterplay to retain | Evidence |
| --- | --- | --- | --- | --- |
| R14 | Magma Storm -> Taunt -> Toxic (P1; Gap) | `magmastorm`, `taunt`, `toxic` | Bind must hit and remain active; residual damage, accuracy, Taunt duration, and escape abilities/items remain native. | [Heatran stallbreaker][heatran] |
| R15 | Infestation -> Toxic -> recovery (P2; Gap) | `infestation`, `toxic`, `recover` | Generalization of binding plus residual pressure; trapping alone has no value in a no-switch matchup. Avoid promoting it solely for trapping. | [Heatran binding components][heatran], [Infestation][infestation] |
| R16 | Ghost Curse -> Substitute/Pain Split (P1; Gap) | `curse`, `substitute`, `painsplit` | User must be Ghost when Curse executes; account for its HP payment, foe immunity, substitute and unequal HP. | [Curse Mimikyu][mimikyu] |
| R17 | Burn -> recovery/defensive setup (P1; Gap) | `willowisp`, `roost`, `calmmind` | Physical damage reduction depends on the attack and abilities; Guts/Facade and Fire immunity are crucial counterexamples. | [Sigilyph][sigilyph], [1v1 archetypes][archetypes] |
| R18 | Wish -> Protect (P1; Gap) | `wish`, `protect` | Own pending Wish amount and exact arrival turn; Protect failure/streak, bypass moves and existing full HP. | [Jirachi][jirachi], [Vaporeon][vaporeon] |
| R19 | Pressure -> Substitute/Protect PP stall (P1; Gap) | `substitute`, `protect`, `calmmind` | Enemy PP, target-dependent Pressure drain, substitute breakpoints, Leftovers, recovery PP and crits. No infinite-loop assumption. | [Suicune][suicune] |
| R20 | Gluttony berry -> Recycle -> repeat (P1; Gap) | `recycle`, `curse` | Exact consumed item, HP threshold, item theft/Knock Off, Recycle failure and PP. | [Snorlax][snorlax] |
| R21 | Harvest berry -> sun -> recovery loop (P2; Gap) | `sunnyday`, `substitute`, `leechseed` | Consumed berry, Harvest probability outside sun, weather turns, HP threshold and item suppression. Sun extension is inferred from Harvest mechanics. | [Trevenant][trevenant], [Harvest][harvest] |
| R22 | Rest + Chesto/Lum -> immediate recovery (P1; Gap) | `rest` | Berry present, usable and unconsumed; Rest must succeed; later Rest has no second berry without recycling. | [Berry guide][berries] |
| R23 | Rain + Hydration -> Rest (P1; Gap) | `raindance`, `rest` | Rain must remain through the cure event; final weather turn can leave user asleep. | [Manaphy][manaphy] |
| R24 | Protect -> Flame/Toxic Orb -> Guts/Facade (P1; Gap) | `protect`, `facade` | Orb activation timing, current status, Guts, residual loss, Facade typing, and item suppression. | [Swellow][swellow], [Machamp][machamp] |
| R25 | Toxic Orb + Poison Heal -> Substitute/Protect (P1; Partial: poison-protect targets foe poison only) | `substitute`, `protect`, `toxic` | Distinguish self-poison healing from foe-poison damage; track activation, HP rounding, faster foes and PP. | [Gliscor][gliscor] |
| R26 | Defensive boosts -> Rest/recovery -> attack (P1; Partial: boost attacks) | `cosmicpower`, `recover`, `storedpower` | Survival gain and critical-hit exposure; diminishing returns, boost caps and Unaware. Sustaining setup needs explicit valuation. | [Clefable][clefable], [Drapion][drapion] |
| R27 | Power Split -> Toxic/Rest (P2; Gap) | `powersplit`, `toxic`, `rest` | Compare actual offensive stats before averaging; opponent can boost afterwards; user still pays sleep turns. | [Shuckle][shuckle] |
| R28 | Charm/Confide -> Rest PP exhaustion (P1; Gap) | `charm`, `confide`, `rest`, `taunt` | Match reductions to foe attacks, track PP, crits, Contrary/Defiant/Competitive and Rest timing. | [Gothitelle][gothitelle] |

## Consumable items and ability-dependent offense

| ID | Candidate (priority; registry coverage) | Moves to audit | Conditions and counterplay to retain | Evidence |
| --- | --- | --- | --- | --- |
| R29 | Fling item -> Acrobatics (P2; Gap) | `fling`, `acrobatics` | Item must be flingable and actually removed; prior Orb activation can matter; unburdened power is not available before removal. | [Fling Acrobatics analysis][fling] |
| R30 | Terrain Seed -> Unburden -> attack (P1; Gap) | `electricterrain`, `acrobatics`, `swordsdance` | Matching terrain/seed, consumption event and Unburden activation flag; being itemless alone is insufficient. Self-setting terrain is a generalization. | [Hawlucha][hawlucha] |
| R31 | Belly Drum -> Sitrus Berry -> priority (P1; Partial: attack-physical) | `bellydrum`, `aquajet` | Current HP, maximum-HP parity, berry threshold, Unnerve and survivable setup. | [Azumarill][azumarill], [berry guide][berries] |
| R32 | Substitute -> Petaya/Torrent -> Water attack (P2; Gap) | `substitute`, `agility`, `surf` | Exact HP subtraction and separate berry/ability thresholds; repeated Substitute requires breaking the old one. | [Empoleon][empoleon] |
| R33 | Endure -> Salac -> Reversal (P2; Partial: endure-low-hp-attack) | `endure`, `reversal` | Opponent must actually damage user into activation range; priority, residual damage and multi-turn resource costs still matter. | [Terrakion][terrakion] |
| R34 | Shell Smash -> White Herb -> attack (P1; Partial: boost attacks) | `shellsmash`, `iciclespear` | Correct stat-drop restoration, prior item consumption, ability effects, multi-hit distribution and priority. | [Cloyster][cloyster], [Crustle][crustle] |
| R35 | Focus Energy + Scope Lens/Sniper -> attack (P1; Partial: focus-energy-attack) | `focusenergy`, `dracometeor` | Run & Bun critical stages, crit-blocking abilities and stat-drop interactions; don't import source damage/rates. | [Kingdra][kingdra] |
| R36 | Contrary -> Leaf Storm snowball (P1; Gap) | `leafstorm` | Negative self stat change becomes a boost; current generic positive-boost matcher misses this producer. Accuracy, Grass immunity and caps remain. | [Serperior][serperior] |
| R37 | Contrary -> Superpower snowball (P1; Gap) | `superpower`, `rest`, `sleeptalk` | Attack/Defense increase from reversed drops; unlike ordinary Superpower, repeated use may improve the position. | [Malamar][malamar] |
| R38 | Simple -> Calm Mind -> Stored Power (P1; Partial: boost-stored-power) | `calmmind`, `storedpower` | Doubled actual stages, caps and Stored Power scaling; may already receive useful ordering without a new family. | [Swoobat][swoobat] |
| R39 | Power Herb -> Geomancy -> attack (P2; Partial: ordinary boosts) | `geomancy`, `moonblast` | One-use herb, charge-state identity, interruption, and whether the move is accessible in this hack. | [Xerneas][xerneas] |
| R40 | Multiscale -> Weakness Policy/Agility -> attack (P2; Partial: boost attacks) | `agility`, `outrage`, `roost` | Requires a survivable actual super-effective hit; cannot assume foe cooperates. Healing may restore Multiscale before another hit. | [Dragonite][dragonite] |
| R41 | Speed Boost -> Protect -> attack/setup (P1; Gap) | `protect`, `swordsdance`, `acrobatics` | End-turn boost and a meaningful speed breakpoint; don't waste Protect when no benefit or when foe exploits the turn. | [Ninjask][ninjask] |
| R42 | Charge Beam behind Substitute -> repeated offense (P2; Partial: special attack follow-up only) | `substitute`, `chargebeam`, `thunderbolt` | Local Run & Bun metadata gives the secondary boost 100% chance, unlike the inherited standard move. Accuracy and secondary suppression still matter; maintaining Substitute costs turns. | [Lanturn][lanturn]; local override audit below |

## Type, accuracy, terrain and turn-order changes

| ID | Candidate (priority; registry coverage) | Moves to audit | Conditions and counterplay to retain | Evidence |
| --- | --- | --- | --- | --- |
| R43 | Soak -> Toxic (P1; Gap) | `soak`, `toxic` | Target really changes type; ability-based status immunity remains. Recheck current types after the move. | [Pyukumuku][pyukumuku] |
| R44 | Gravity -> inaccurate status/attack (P1; Gap) | `gravity`, `hypnosis`, `focusblast` | Accuracy stages and field duration; setup is useful only if accuracy benefit outweighs its turn. | [Gravity guide][gravity] |
| R45 | Gravity -> Ground attack (P1; Gap) | `gravity`, `earthquake` | Grounding changes actual immunity; native ability/item/type rules, damage and field expiry decide the result. | [Gravity guide][gravity] |
| R46 | Smack Down -> Ground attack (P1; Gap) | `smackdown`, `earthquake` | Smack Down must connect and leave the foe grounded; immunity source, Substitute and existing grounding matter. | [Landorus-T][landorus] |
| R47 | Knock Off Air Balloon -> Ground attack (P1; Gap) | `knockoff`, `earthquake` | Foe must hold a removable Balloon; other Ground immunities can persist. | [Gliscor][gliscor-current] |
| R48 | Trick Room -> ordinary-priority attack (P1; Gap) | `trickroom`, `psychic` | Effective relative Speed, setup survival, duration and priority brackets; Trick Room can favor the opponent. | [Beheeyem][beheeyem], [priority guide][priority] |
| R49 | Psychic Terrain -> Expanding Force (P1; Gap) | `psychicterrain`, `expandingforce` | Grounded attacker, terrain duration, Dark immunity and terrain replacement. | [Indeedee][indeedee] |
| R50 | Sun -> Chlorophyll/Solar Power offense (P1; Partial: sun-fire only) | `sunnyday`, `solarbeam`, `flamethrower` | Ability-specific speed/damage and Solar Power HP loss; other attack types can benefit. Mechanic-derived generalization. | [Battle conditions guide][conditions], [Regirock sun support][regirock] |
| R51 | Rain/sand/hail -> weather-speed offense (P1; Partial: rain-water/hail-blizzard only) | `raindance`, `sandstorm`, `hail`, `waterfall`, `ironhead`, `iciclecrash` | Swift Swim/Sand Rush/Slush Rush, exact Speed crossover and weather expiry; weather setters can help the opponent. Mechanic-derived generalization. | [Ludicolo][ludicolo], [Stoutland][stoutland], [Beartic][beartic] |

## Survival, retaliation, histories and end conditions

| ID | Candidate (priority; registry coverage) | Moves to audit | Conditions and counterplay to retain | Evidence |
| --- | --- | --- | --- | --- |
| R52 | Sash -> Endeavor -> priority (P1; Gap) | `endeavor`, `quickattack` | Full HP/Sash activation, actual HP gap, Ghost immunity, multiple hits, priority and residual damage. | [Rattata FEAR][rattata] |
| R53 | Sturdy -> Endeavor -> Shell Bell reset (P2; Gap) | `endeavor`, `sandstorm`, `toxic` | Heal must actually restore full HP; level/HP gap, damage amount, ability bypass and residual timing. Not universally self-sustaining. | [Aron 1v1][aron] |
| R54 | Survive -> Counter/Mirror Coat (P1; Gap) | `counter`, `mirrorcoat` | Actual damage/category/target, survival method, immunity and multi-hit behavior. Neither choice assumes the foe reveals its move first. | [Kadabra][kadabra], [Wobbuffet][wobbuffet] |
| R55 | Imprison -> Transform -> restriction (P1; Gap) | `imprison`, `transform` | Successful transformation, copied legal moves, PP, speed and interruption; native requests must reflect the new moveset. | [Mew analysis][mew] |
| R56 | Taunt -> Destiny Bond (P2; Gap) | `taunt`, `destinybond` | Bond active on actual KO, priority and repeat-use limits; opponent can still choose among damaging actions. Draws/trades need explicit outcome semantics. | [Froslass][froslass] |
| R57 | Use other moves -> Last Resort (P1; Gap) | `fakeout`, `highjumpkick`, `lastresort` | Every other known move must have been used since entry; exact moves-used history and Fake Out entry window. | [Lopunny][lopunny] |
| R58 | Encore damaging move -> matching retaliation (P1; Gap) | `encore`, `counter`, `mirrorcoat` | Infer restriction from an observed completed move, never a future AI choice; Encore expiry, damage and immunity remain. | [Wobbuffet][wobbuffet] |
| R59 | Sleep -> Substitute -> Focus Punch (P1; Partial: substitute-focus-punch) | `spore`, `substitute`, `focuspunch` | Three-step bridge; must pay setup HP and survive variable sleep, multi-hit, sound and Infiltrator replies. | [Breloom][breloom] |
| R60 | Burn/status Orb -> Psycho Shift -> sustain (P2; Gap) | `psychoshift`, `roost`, `calmmind` | Current transferable status, Magic Guard, target susceptibility, Orb reactivation and accuracy. | [Sigilyph][sigilyph] |

## Additional field, ability and setup interactions

| ID | Candidate (priority; registry coverage) | Moves to audit | Conditions and counterplay to retain | Evidence |
| --- | --- | --- | --- | --- |
| R61 | Tailwind -> attack (P1; Gap) | `tailwind`, `bravebird` | Relative Speed improvement, priority brackets, setup survival and remaining turns. Self-attack extension inferred from field support. | [Talonflame][talonflame] |
| R62 | Reflect/Light Screen -> setup/attack (P1; Gap) | `reflect`, `lightscreen`, `calmmind`, `psychic` | Appropriate incoming damage category, screen duration, critical hits, screen-breaking moves and bypass abilities. Self-setup extension inferred from team screen strategy. | [Screen strategy][screens] |
| R63 | Hail -> Aurora Veil -> setup/attack (P1; Gap) | `hail`, `auroraveil`, `nastyplot`, `blizzard` | Hail at casting, weather replacement, existing screens, duration and two setup turns. | [Alolan Ninetales][ninetales] |
| R64 | Grassy Terrain -> recovery/Grassy Glide (P1; Gap) | `grassyterrain`, `grassyglide`, `protect` | Groundedness, passive recovery for both sides, actual move priority, duration and weakened Ground moves. Self-setting/protection extension inferred from terrain components. | [Rillaboom][rillaboom] |
| R65 | Corrosion -> Toxic -> stall normally immune types (P1; Partial: inflict-poison guard already checks Corrosion) | `toxic`, `substitute`, `protect` | Bypasses type immunity, not all ability/terrain/item/status restrictions; no need to duplicate the existing Corrosion guard. | [Salazzle][salazzle] |
| R66 | Shed Skin -> Rest -> recover from sleep (P1; Gap) | `rest`, `bulkup`, `drainpunch` | Ability cure is probabilistic; never assume immediate wake-up; compare bulk gained and remaining sleep. | [Scrafty][scrafty] |
| R67 | Bulk Up -> Drain Punch sustain (P1; Partial: attack-physical) | `bulkup`, `drainpunch` | Healing depends on actual damage and current missing HP; Liquid Ooze, immunity, damage caps and crits prevent naive recovery loops. | [Conkeldurr][conkeldurr] |
| R68 | Swagger -> Foul Play (P2; Gap) | `swagger`, `foulplay`, `substitute` | Raising foe Attack helps Foul Play but also their attacks and confusion damage; probability of acting and accuracy are explicit. | [Klefki][klefki] |
| R69 | Gastro Acid -> exploit suppressed ability (P2; Gap) | `gastroacid`, `toxic` | Suppressible target ability actually blocks the follow-up; underlying type immunity remains. Inference from ability suppression and status components. | [Gastro Acid][gastroacid], [Toxic][toxic-source] |
| R70 | Coil -> Hypnosis/inaccurate attack (P1; Gap) | `coil`, `hypnosis`, `muddywater` | Accuracy stages, caps, immunity, available sleep turns and setup cost. A boost matcher must support non-damaging follow-ups. | [Milotic][milotic] |
| R71 | Sound move -> Throat Spray -> stronger offense (P1; Gap) | `boomburst`, `overdrive` | Item consumption event, sound immunity, target immunity, item suppression and single-use nature. | [Toxtricity][toxtricity] |
| R72 | Power Herb -> Meteor Beam -> special attack (P1; Partial: ordinary boost follows) | `meteorbeam`, `sludgewave` | Native charge/boost timing, one-use item, accuracy and survival without the herb on subsequent attempts. | [Nihilego][nihilego] |

## Local presence and override audit

Against checkout `5df9797` plus this research document:

- Every candidate has a unique ID. There are **72 rows: 55 registry gaps and
  17 partial overlaps/extensions**. These are candidate distinctions, not an
  assertion that each needs its own runtime pattern.
- All **111 explicitly listed move IDs** were compared with both
  `run-bun/reference/mappings.json` and `completeMoveDex` (the Run & Bun mod).
  Presence means the decoder has a name and the native engine has metadata;
  it does not establish encounter availability or legal same-species movesets.
- A separate audit checked 26 named ability and 21 item components against
  decoder mappings and native metadata, with no missing entries. These metadata
  inspections are not native battle-outcome tests or an exhaustive item audit.
- Charge Beam's local secondary chance is 100; its boost is nested under
  `secondary.self.boosts`, which the current registry producer scan misses.
- Leaf Storm and Superpower have negative `self.boosts`; Contrary converts
  them into beneficial stages, but the producer scan only indexes positive
  metadata changes. This is a general producer gap, not two unrelated bugs.
- Geomancy has ordinary positive `boosts` plus a charge callback; the existing
  boost pattern can find it, but doesn't select on Power Herb readiness.
- Some Dex pages return only a JavaScript loading shell to the browsing tool.
  Such links are supplemental references, not evidence that their rendered
  strategy text was read. Authored articles/search-indexed analyses supply the
  strategy examples; local Run & Bun metadata supplies the override findings.

## Scope exclusions and misleading shortcuts

- Perish trapping: trapping plus Perish Song appears in [published Gengar
  discussion][gengar-discussion]. Ordinary Perish Song also affects its user.
  A usable plan needs escape, unequal existing counters, immunity, or explicitly
  modeled simultaneous-faint rules. Do not add a generic Perish Song -> Protect
  "win" pattern to this no-switch matchup model.
- Truant Entrainment: [Durant][durant] documents the ability-transfer idea. The
  familiar Protect/setup chain normally hands off to a teammate; Durant itself
  retains Truant. Treat the complete chain as switch-dependent, not ready.
- Baton Pass/Flip Turn/U-turn/Volt Switch, Wish passing, Healing Wish, Regenerator
  cycling, Intimidate cycling, hazards plus forced switching, and Future Sight
  plus a teammate's attack need team transitions. Existing single-Pokemon field
  effects can still matter, but don't imply those full plans are searchable.
- Helping Hand, Follow Me/Rage Powder, ally Skill Swap, Beat Up + Justified,
  Weakness Policy self-trigger by a partner, pledge combinations and ally
  After You/Quash need doubles coordination. Do not fold them into singles hints.
- Mega/Z/Tera/Dynamax-specific sets and post-Gen-8 moves need explicit hack
  support. Seeing an inherited native Dex entry is not evidence the live ROM
  supplies that move or transformation.
- One-hit-KO accuracy manipulation has native exceptions: Lock-On/No Guard or
  Gravity cannot be assumed to make every OHKO succeed. Level, immunity and
  move-specific checks remain. Keep it out of generic inaccurate-attack proofs.
- Raising Defense for Body Press, speed for Electro Ball, ordinary boosts for
  Stored Power, weather accuracy, Defense Curl/Rollout, Charge, and RestTalk
  were already represented. New species sets using these are not new families.

## Shared design changes used for implementation

The expanded registry uses shared selectors and requirements for these needs:

1. **Event producers:** item consumption, status from an Orb, secondary boosts,
   Contrary reversal, ability/weather triggers and delayed effects. A status
   or boost need not come from a primary move field.
2. **Temporal requirements:** remaining sleep/weather/Encore/Disable/taunt/Wish
   turns, entry windows, used-move history, consumed item and last actual move.
3. **Resource conditions:** exact HP/rounding, PP, berry thresholds, substitute
   HP, item restoration and finite loop costs.
4. **Relational conditions:** actual relative Speed/order, appropriate defensive
   stat, attack category, immunity removal, survivable setup and groundedness.
5. **Cycle-aware planning:** states can return to the same effects while HP, PP,
   Toxic counter or weather duration changes. Hash those resources into state;
   matching an effect loop does not certify a perpetual or winning loop.

The implementation shares producer/condition machinery across the whole
catalogue rather than adding 72 search branches. Positive and counterexample
tests validate its state requirements. Native turn simulation still decides
actual effects and counterplay, and no fixed opponent strategy is assumed.
Cycle hints do not replace the native search's resource accounting. Broader
candidate coverage is not evidence of reaching the 300 ms accuracy goal;
benchmark forecast timing and accuracy separately.

## Sources

[breloom]: https://www.smogon.com/dex/dp/pokemon/breloom/
[hypno]: https://www.smogon.com/dex/gs/pokemon/hypno/
[darkrai]: https://www.smogon.com/dex/sm/pokemon/darkrai/
[vaporeon]: https://www.smogon.com/dex/sm/pokemon/vaporeon/
[jirachi]: https://www.smogon.com/dex/sm/pokemon/jirachi/
[archetypes]: https://www.smogon.com/articles/face-to-face
[lanturn]: https://www.smogon.com/dex/dp/pokemon/lanturn/
[lopunny]: https://www.smogon.com/dex/xy/pokemon/lopunny/
[gengar-discussion]: https://www.smogon.com/forums/threads/gengar.3508859/
[restrictions]: https://www.smogon.com/dp/articles/move_restrictions
[annoying]: https://www.smogon.com/smog/issue23/annoying_sets
[torment]: https://www.smogon.com/dex/dp/pokemon/heatran/
[heatran]: https://www.smogon.com/dex/xy/pokemon/heatran/
[whimsicott]: https://www.smogon.com/dex/xy/pokemon/whimsicott/
[rotom]: https://www.smogon.com/forums/threads/rotom-w.3495103/
[sableye]: https://www.smogon.com/dex/sv/pokemon/sableye/draft/
[infestation]: https://www.smogon.com/dex/ss/moves/infestation/
[mimikyu]: https://www.smogon.com/dex/sm/pokemon/mimikyu/battle-spot-singles/
[sigilyph]: https://www.smogon.com/dex/xy/pokemon/sigilyph/
[suicune]: https://www.smogon.com/dex/sm/pokemon/suicune/
[snorlax]: https://www.smogon.com/dex/sm/pokemon/snorlax/
[trevenant]: https://www.smogon.com/dex/xy/pokemon/trevenant/
[harvest]: https://www.smogon.com/dex/ss/abilities/harvest/
[berries]: https://www.smogon.com/smog/issue34/xy-berries
[manaphy]: https://www.smogon.com/dex/sm/pokemon/manaphy/
[gliscor]: https://www.smogon.com/dex/sm/pokemon/gliscor/
[clefable]: https://www.smogon.com/dex/sm/pokemon/clefable/
[drapion]: https://www.smogon.com/dex/dp/pokemon/drapion/
[shuckle]: https://www.smogon.com/dex/xy/pokemon/shuckle/
[gothitelle]: https://www.smogon.com/dex/sm/pokemon/gothitelle/ag/
[fling]: https://www.smogon.com/forums/threads/acrobatic-stallbreaker-gliscor.3554728/
[hawlucha]: https://www.smogon.com/dex/ss/pokemon/hawlucha/
[azumarill]: https://www.smogon.com/dex/ss/pokemon/azumarill/bdsp-ou/
[empoleon]: https://www.smogon.com/dex/bw/pokemon/empoleon/uu/
[terrakion]: https://www.smogon.com/dex/sv/pokemon/terrakion/draft/
[cloyster]: https://www.smogon.com/forums/threads/cloyster.3702450/
[crustle]: https://www.smogon.com/dex/sm/pokemon/crustle/
[kingdra]: https://www.smogon.com/dex/xy/pokemon/kingdra/
[serperior]: https://www.smogon.com/dex/sm/pokemon/serperior/
[malamar]: https://www.smogon.com/dex/sv/pokemon/malamar/
[swoobat]: https://www.smogon.com/dex/bw/pokemon/swoobat/nu/
[xerneas]: https://www.smogon.com/dex/sm/pokemon/xerneas/
[dragonite]: https://www.smogon.com/dex/xy/pokemon/dragonite/battle-spot-singles/
[ninjask]: https://www.smogon.com/forums/threads/ninjask-q-c-2-2-g-p-2-2.3683407/
[pyukumuku]: https://www.smogon.com/articles/ou-spotlight-pyukumuku
[gravity]: https://www.smogon.com/dp/articles/gravity_guide
[landorus]: https://www.smogon.com/dex/sm/pokemon/landorus-therian/
[gliscor-current]: https://www.smogon.com/dex/sv/pokemon/gliscor/
[beheeyem]: https://www.smogon.com/dex/sm/pokemon/beheeyem/
[priority]: https://www.smogon.com/resources/competitive/bw/priority
[indeedee]: https://www.smogon.com/forums/threads/terrain-setter-indeedee-psychic-qc-2-2-gp-1-1.3778086/
[rattata]: https://www.smogon.com/dex/bw/pokemon/rattata/
[aron]: https://www.smogon.com/dex/sm/pokemon/aron/1v1/
[kadabra]: https://www.smogon.com/dex/sm/pokemon/kadabra/
[wobbuffet]: https://www.smogon.com/dex/sm/pokemon/wobbuffet/
[mew]: https://www.smogon.com/articles/1v1-suspect-mew
[froslass]: https://www.smogon.com/dex/sm/pokemon/froslass/
[durant]: https://www.smogon.com/dex/bw/pokemon/durant/
[swellow]: https://www.smogon.com/forums/threads/swellow-qc-1-2.3471529/
[machamp]: https://www.smogon.com/dex/sm/pokemon/machamp/
[conditions]: https://www.smogon.com/resources/beginner/battle_conditions
[regirock]: https://www.smogon.com/dex/sm/pokemon/regirock/
[ludicolo]: https://www.smogon.com/dex/sm/pokemon/ludicolo/
[stoutland]: https://www.smogon.com/dex/xy/pokemon/stoutland/nu/
[beartic]: https://www.smogon.com/dex/sm/pokemon/beartic/
[talonflame]: https://www.smogon.com/dex/sm/pokemon/talonflame/
[screens]: https://www.smogon.com/forums/threads/dual-screens-reflect-and-light-screen.3491571/
[ninetales]: https://www.smogon.com/dex/sm/pokemon/ninetales-alola/
[rillaboom]: https://www.smogon.com/dex/sv/pokemon/rillaboom/national-dex/
[salazzle]: https://www.smogon.com/dex/sm/pokemon/salazzle/
[scrafty]: https://www.smogon.com/dex/xy/pokemon/scrafty/
[conkeldurr]: https://www.smogon.com/forums/threads/conkeldurr-bulk-up.3579478/
[klefki]: https://www.smogon.com/forums/threads/klefki-singles.3539692/
[gastroacid]: https://www.smogon.com/dex/sm/moves/gastro-acid/
[toxic-source]: https://www.smogon.com/dex/sm/moves/toxic/
[milotic]: https://www.smogon.com/dex/sm/pokemon/milotic/
[toxtricity]: https://www.smogon.com/forums/threads/toxtricity.3656295/
[nihilego]: https://www.smogon.com/dex/ss/pokemon/nihilego/
