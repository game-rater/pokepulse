# Ordered strategy index

`strategy-registry.mjs` stores 40 families of ordered move/effect sequences.
The registry changes search order only. It supplies no damage, probability,
legality, guaranteed-win certificate or NPC action prediction.

The broader [strategy survey](STRATEGY-SURVEY.md) records 72 additional candidate
entries, including overlaps and missing conditions. It is a sourced research
backlog, not 72 newly implemented runtime patterns.

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

Each step stores an effect selector and required current-state facts. The lookup
finds the furthest usable step whose remaining moves are available. Setup can
have come from outside the moveset. Conditions are checked again each time;
curing sleep, ending weather, losing a Substitute or exhausting PP changes the
result immediately. This is a candidate sequence, not a commitment to follow it
after the opponent acts. All native event timing and randomness still execute.

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
