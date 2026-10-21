# Ordered strategy index

`strategy-registry.mjs` stores 108 families of ordered move/effect sequences.
The registry changes search order only. It supplies no damage, probability,
legality, guaranteed-win certificate or NPC action prediction.

The broader [strategy survey](STRATEGY-SURVEY.md) records 72 candidate entries.
All 72 now map to runtime patterns in `surveyStrategyCoverage`: 68 new patterns
and five entries covered by enhanced existing patterns (one entry maps to two
new patterns). Survey entries and distinct families are deliberately different
counts. The switch/doubles exclusions remain outside the current search scope.

## Families

| Setup | Later steps |
| --- | --- |
| Opponent sleep | Wake-Up Slap; Dream Eater |
| Opponent status / poison / paralysis | Hex; Venoshock; Smelling Salts |
| Rest | Sleep Talk; Snore |
| Attack / Sp. Attack boost | Matching physical / special attack |
| Defense / Speed boost | Body Press / Electro Ball |
| Defense / Sp. Defense reduction | Attack using the lowered defensive stat |
| Positive boosts | Stored Power; Power Trip |
| Poison | Protect; recovery; Protect then recovery |
| Leech Seed | Protect; recovery; Substitute then Protect |
| Substitute | Focus Punch |
| Defense Curl | Rollout; Ice Ball |
| Charge / Focus Energy | Electric attack / scalable damaging attack |
| Rain | Water attack; Thunder; Hurricane |
| Sun | Fire attack; Solar Beam; Solar Blade; Growth then special attack |
| Weather / hail / sand | Weather Ball / Blizzard / Shore Up |
| Lock-On or Mind Reader | Inaccurate attack |
| Endure | Low-HP Reversal or Flail |
| Stockpile | Spit Up; Swallow |
| Sleep / Yawn | Focus Punch; Nightmare; Bad Dreams stall; Protect then attack |
| Paralysis / confusion | Flinching attacks; confusion then attack |
| Encore / Disable / Torment / Taunt | Setup; move restriction; Substitute/protection; residual pressure; retaliation |
| Binding / Ghost Curse / burn | Taunt; poison; recovery; Substitute; Pain Split |
| Wish / Pressure / defensive boosts | Protection; PP stall; recovery then attack |
| Recycle / Harvest / Chesto / Hydration / Shed Skin | Resource-dependent recovery and Rest sequences |
| Orb / terrain seed / Sitrus / Salac / Petaya / White Herb | Status-powered attacks; Unburden; low-HP attacks; setup |
| Contrary / Simple / secondary boosts | Reversed self-drops; doubled stages; Charge Beam; stored-power attacks |
| Scope Lens / Power Herb / Weakness Policy / Speed Boost | Critical setup; charge skipping; conditional setup; protection |
| Soak / Gravity / Smack Down / Knock Off / Gastro Acid | Remove relevant type, grounding or ability barriers |
| Trick Room / Tailwind / screens / terrain / weather abilities | Turn-order, defensive or offensive follow-ups |
| Endeavor / Sturdy / Sash / Counter / Mirror Coat | Conditional survival, priority finishing or retaliation |
| Imprison / Transform / Destiny Bond / Last Resort | Changed movesets, restrictions, trades and completed-move history |
| Swagger / Coil / sound moves | Foul Play; accuracy follow-ups; Throat Spray |

Each step stores an effect selector and required current-state facts. The lookup
finds the furthest usable step whose remaining moves are available. Setup can
have come from outside the moveset. Conditions are checked again each time;
curing sleep, ending weather, losing a Substitute or exhausting PP changes the
result immediately. This is a candidate sequence, not a commitment to follow it
after the opponent acts. All native event timing and randomness still execute.

`strategy-expansions.mjs` owns the declarative expanded catalogue and survey
coverage map. `strategy-conditions.mjs` owns shared metadata extraction and
requirements: effective abilities/items, timers, actual move history, HP/PP,
grounding, relative Speed, consumed items and resource thresholds. Static move
profiles include primary and secondary effects and both signs of self-stat
changes. Lookup tests the current ability and stage limits, including Contrary;
it never treats secondary activation or Shed Skin as a guaranteed event.

Future stages need remaining PP; the next step must also be in the current
legal request. Specific finishers rank above generic attack hints. Metadata is
cached, but live eligibility is recomputed and memoized only within one lookup.
No battle objects or eligibility results are retained by the metadata caches.

## Hash lookup and ownership

An inverted `Map` indexes effect tags to relevant patterns. A separate bounded
metadata cache is owned by each native Dex instance through a `WeakMap`. It holds
up to 1,024 move profiles and 256 moveset bindings. Canonical sorted, deduplicated
move IDs form exact string keys; `Map` handles hashing and string equality.
There is no truncated custom hash, fixture identity or cached battle-state
eligibility. Slot numbers are resolved from the current request after lookup.

Root pilot priorities include these hints for both sides. Native continuation
probes prioritize matching setup or ready follow-up pairs, retaining every move
pair and its original chance seed. After a terminal anchor, the scan finishes
that anchor's row or column. Fixed NPC probabilities remain unchanged.

## Evidence and limits

All families have native-metadata controls in `test/strategy-registry.test.mjs`.
The expanded families and all 72 survey references are covered by
`test/strategy-expansions.test.mjs`, including completed native-turn transitions
and invalidation controls for history, timers, items, immunity and resource use.
Controls cover phase changes, external setup, PP and disabled choices, slot
permutations, basic immunities, Contrary, Body Press/Foul Play stat exceptions,
Poison Heal/Magic Guard stall exceptions, state purity and late-slot finishing
attacks. These are ordering hints; the guards do not duplicate all native
immunities, ability interactions, timing, cures or counterplay.

Mechanics were checked against the installed Run & Bun move overrides and the
inherited native callbacks in `vendor/showdown/dist/data/moves.js`. External
strategy examples used for discovery include [Rest and Sleep Talk](https://www.smogon.com/dex/sm/pokemon/chinchou/)
and the [rain offense guide](https://www.smogon.com/dp/articles/rain_offense).
Those sources are examples, not authorities for Run & Bun overrides.

Run `node scripts/benchmark-strategy-index.mjs` for first-lookup and repeated
lookup costs. This measures matching only; it must not be presented as forecast
latency or a demonstrated prediction speedup.
