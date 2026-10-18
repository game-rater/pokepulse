# Additional battle scenario audit

| Scenario category | Failure found | Correction |
|---|---|---|
| End-of-turn abilities, contact abilities and reactive items | Routing based mainly on move definitions could omit ability/item effects | Central capability contract; unlisted ability/item mechanics use native execution |
| Stat changes, accuracy/evasion, depleted PP and disabled attacks | Fast frontier evaluator used opening damage rows and availability | Recompute from the current state's legal moves and damage descriptions |
| Rare critical/high damage outcomes | A damage-range midpoint was treated like expected damage | Use probability-weighted damage distributions |
| Terrain plus contact status | Fast contact triggers omitted terrain when checking status immunity | Pass current terrain/weather and check grounded recipients |
| Poison Touch plus Shield Dust | Fast contact trigger omitted the ability interaction | Match native status prevention |
| Guaranteed critical attacks | Cutoff probes forced all critical flags off | Preserve guaranteed critical moves |
| Missing genders | Unknown gender data could act like genderless immunity to Cute Charm | Keep required missing data unresolved; retain known genderless immunity |
| Terminal states | A heuristic could run even after a win/loss was resolved | Bypass heuristic evaluation for terminal outcomes |
| Soul Dew | Native defaults and Run & Bun calculator disagreed about the item | Reproducible native special-stat override, compared on Latios, Latias and a non-user |

The dedicated suite contains 31 routing checks and 21 behavior/evaluation comparisons. Routing cases include Speed Boost, Moody, status-curing/weather abilities, Cute Charm, Synchronize, reactive stat abilities, Shell Bell, flinch items, PP restoration and stat berries. The behavior cases separately exercise selected native effects and parity; they do not certify every routed ability/item combination.

Checked without finding an additional fault: snapshot construction already clears constructor-created weather and terrain before restoring observed field state. That code was retained.

See `MECHANICS-OWNERSHIP.md` for rule ownership and `PERFORMANCE-TARGETS.md` for the latency/accuracy development goal. Fixtures remain synthetic; emulator state and saves are preserved.
