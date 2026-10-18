# Optional NPC AI optimizer

Open the overlay's three-dot menu and check **Use NPC AI**. Uncheck it to return to adversarial minimax. The server saves the selection in `run-bun/live/optimizer-settings.json`; position, size and appearance settings remain separate. Switching clears the old prediction and recomputes from the current live decision state. During animations, computation waits for the next decision state.

The NPC optimizer uses the MIT-licensed Run & Bun move-scoring implementation from [rnb-calc-ultimate](https://github.com/SynchEleven/rnb-calc-ultimate). The exact imported commit and license are in `vendor/npc-ai`. Importing strips TypeScript annotations and adds a compatibility method for the existing calculator. No package installation or network connection is needed at runtime.

Random damage assessments, randomized score bonuses and highest-score ties produce a probability distribution over legal NPC moves. The root maximizes the player's expected outcome against this distribution. Subsequent native battle simulations recompute the NPC distribution as HP, PP, status, items, boosts and field effects change. NPC choices use probability-weighted sampling; actual turn outcomes still use the native Run & Bun mechanics engine, including the existing critical-hit rates.

Sampling allocation uses probability-weighted row confidence intervals. It does not eliminate opponent columns using minimax dominance: a bad move that the NPC might choose still contributes to the estimate. Zero-probability choices receive no samples. NPC and minimax samples use separate caches. NPC mode runs one worker, even when the optional exact/hybrid minimax race is enabled.

## Current limits

This is a community prediction model, **not a verified execution of the ROM AI**. Trainer-specific AI flags, switching, bench Pokémon and doubles are not covered. The reported percentage remains an active-matchup estimate, with heuristic player continuations and finite simulation horizons; it is not full-team battle odds.

Live remaining-team counts are not decoded. When competing self-sacrifice or Perish Song choices need these counts, NPC mode reports missing input instead of assuming the NPC is on its final Pokémon. First-turn/history uncertainty still follows the mechanics engine's missing-input rules. Some upstream status scoring uses generic rules; the adapter excludes known singles-only no-effect moves when there is a meaningful alternative. This is not a claim that every move's scoring is ROM-verified.

The next fidelity step is to compare recorded move distributions with native AI choices and decode verified trainer flags and party counts. The native overlay label remains a plain whole percentage.

## Checks

`node --test test/npc-ai.test.mjs` checks normalized scoring, ties, HP-dependent recovery, PP restrictions, all mapped ROM moves, weighted expectation, missing team inputs, isolated caches and worker routing.

`node --test test/npc-ai-correctness.test.mjs` checks 14 targeted scenarios adapted from the upstream test categories: redundant status, Corrosion, Rest abilities, weather recovery, Shore Up, toxic/Protect timing and rounding, residual immunity, fixed multi-hit counts, imminent-KO priority, attack immunity, Psychic Terrain grounding and first-turn/powder restrictions.

`node scripts/audit-npc-ai.mjs` runs those same scenarios against an isolated copy of the original pinned predictor and the patched version. At the current import, upstream passes 6/14 and the patched adapter passes 14/14. This reproduces eight failures rather than assuming every README issue applies. In particular, the imported source already contains a complete status-applying move list and rejects redundant status; those checks required no new patch.

Local patches are applied reproducibly by `scripts/npc-ai-patches.mjs` during import and recorded in `vendor/npc-ai/source.json`. Weather recovery now uses the actual healing fractions rather than the community predictor's full-HP sun assumption; ability lookups use the attacker; Protect receives the next native toxic stage; fixed three-hit moves stay at three under Skill Link; immune stat-dropping attacks do not earn their secondary bonus; Psychic Terrain priority penalties require a grounded target. These are model corrections, not native ROM AI validation. The battle mechanics critical-hit rates are unaffected.
