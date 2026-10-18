# Active matchup mechanics

Trainer AI, switching, full teams and doubles are excluded. Both sides still choose moves using the existing simultaneous minimax search.

## Included in future states

- Ordinary damage-based recoil, crash damage, Struggle, Life Orb and Mind Blown/Steel Beam self damage.
- Sturdy and explicitly known intact/busted Disguise; independent hits continue after protection is consumed.
- Rough Skin, Iron Barbs, Aftermath, Static, Flame Body, Poison Point, Effect Spore, Poison Touch, Cursed Body, Gooey, Tangling Hair, Stamina, Weak Armor, Justified, Rattled, Water Compaction and Steadfast.
- Absorption healing/stat boosts, Flash Fire activation and Unburden after item loss.
- Protect/Detect, King's Shield, Spiky Shield, Baneful Bunker, Obstruct, Endure, Substitute and their effects on queued attacks.
- Simple stat moves from bundled metadata, recovery, Rest, Roost, weather-dependent recovery, Haze, Belly Drum, Pain Split, confusion moves, Toxic, Leech Seed and status curing.
- Resistance berry consumption, Weakness Policy, Absorb Bulb, Cell Battery, Air Balloon, terrain seeds, Knock Off, Thief/Covet and Bug Bite/Pluck.
- Sand/hail damage, supported weather abilities, Grassy Terrain, Leech Seed, binding damage, Leftovers/Black Sludge, burn/poison and status orbs. Residual phases are separate so healing can precede status damage.
- Reflect, Light Screen, Tailwind, Trick Room, weather, terrain, Taunt, Disable and Encore creation and expiry.
- Sucker Punch's condition; Counter, Mirror Coat and Metal Burst use actual damage received that turn.
- Standard charging and semi-invulnerable attacks, Power Herb, recharge attacks, Outrage/Thrash/Petal Dance duration and confusion, Rollout/Ice Ball progression and Defense Curl.
- Run & Bun accuracy changes, Zoom Lens, Micle Berry consumption/expiry, one-hit KO accuracy and level restrictions. Critical rates remain 1/16, 1/8, 1/2 and 1.

The custom damage calculator is prevented from repeating entry stat boosts or terrain seed boosts already represented in the forecast state. Raw calculator users retain its existing behavior.

## Unknown live information

An existing temporary effect without a remaining-duration counter does not persist forever in a forecast. A continuation that needs its expiry is unresolved. Existing toxic poison without a damage counter is likewise unresolved at its relevant residual step. Permanent weather must be explicitly represented by `weather_turns: -1`; the current Pokémon's ability alone does not prove the weather's origin.

The decoder reads named status2/status3 effects, Substitute HP, Bide stored damage, charge/recharge and locked moves, Stockpile, Rollout, first-turn eligibility, screen/side timers, weather/terrain/field timers, pending Wish and Future Sight, Choice locks, Truant, Slow Start, Flash Fire, Unburden and Micle state. The mappings are documented in run-bun/live-effects.mjs and the adapter profile. Reserved or inconsistent flags remain unresolved. Nature and friendship come from checksum-verified party records matched to the active personality and trainer IDs. If matching fails, nature stays explicitly unknown; pinch berry confusion is unresolved if it could matter. Observed types and ability activation flags are forwarded into both preview damage and future states.

Normalized snapshots accept explicit timer and volatile fields under each side's `effects`. Input validation rejects malformed values. Shared weather/terrain/Trick Room timers may be supplied on either side. Known move history is accepted as `last_move`; otherwise Disable, Encore and Eerie Spell can remain unresolved.

All 778 mapped ROM moves have executable definitions. Complex callbacks use the vendored Pokémon Showdown simulator with Run & Bun overrides; ordinary supported moves retain the faster adapter. Ally and switching interactions follow the active singles matchup scope. Missing live state stays unresolved; additional search depth cannot recover an unknown input.

## Sources and validation limits

- [Creator's move changes](https://docs.google.com/spreadsheets/d/1CgGbps15g9EHtrtXzNsJ7_p6oqvqYSuMd0lKeIk36Og/edit), retained locally in `run-bun/reference/move-changes.csv`.
- [Showdown move definitions](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts), [abilities](https://github.com/smogon/pokemon-showdown/blob/master/data/abilities.ts), [items](https://github.com/smogon/pokemon-showdown/blob/master/data/items.ts), and [conditions](https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts), using Generation 8 defaults and Run & Bun overrides.
- Existing fingerprinted decoder layout and adapter verification records in `run-bun/reference/adapter-profile.json`.

Regression checks cover Run & Bun critical rates and per-hit criticals, multi-hit accuracy, held-item timing, move-effect branches, battle phases, and the accuracy/evasion stage multipliers. All 136 numeric accuracy edits in the local Run & Bun change table match the accuracy calculation at neutral stages. The coverage audit executes one synthetic turn for every mapped move. Focused checks cover delayed healing, Transform, Bide, Foresight, singles Helping Hand, exact chance mass, and Run & Bun overrides.

Synthetic execution coverage does not certify every conditional effect against the ROM. Checksum-verified identity extraction has been checked against a current local capture. Undecoded volatile effects and unobserved move history remain unknown.



## Live effect verification

The local audit restored 82 isolated native snapshots without decoding, validation, execution errors, or unknown-effect warnings. Synthetic tests cover counter decoding and continued effects, including Stockpile release, Yawn, Perish Song, charged attacks, Wish, Future Sight, protection streaks, and Micle activation. Captures stay local and are not bundled as fixtures. This is targeted verification, not proof of every possible effect interaction.

