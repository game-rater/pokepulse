# Battle progression regression tests

Run the focused scenarios with:

```powershell
node --test --test-concurrency=1 test/battle-progression.test.mjs test/battle-stream.test.mjs test/npc-ai-correctness.test.mjs
```

The progression and stream files add 48 cases. An additional NPC toxic-rounding case brings this change to 49 new cases.

## Coverage

| Family | Checks |
| --- | --- |
| Fixed-damage races | Exact win odds agree with an independent arithmetic oracle at every observed turn, through the final knockout, for both speed orders and multiple HP combinations. |
| Paralysis | Exact probabilities agree with a separate recursive oracle; observations of successful actions or full paralysis update the odds correctly. |
| Both optimizers | Minimax and NPC sampled estimates follow entire deterministic active matchups, remain near the known outcome, and report the exact terminal result. |
| Sleep | A known wake-up counter expires; the forecast distinguishes surviving until wake-up from fainting first. |
| HP changes | Monotonicity is checked only for plain fixed-damage races. It is not asserted for mechanics such as Reversal or Endeavor. |
| Cached observations | Repeating the same observation preserves samples and the reading; an old winning position cannot contaminate a new losing one. |
| PP exhaustion | Spending the final PP leads to Struggle; recoil and mutual knockout affect the prediction. |
| Item consumption | Focus Sash and Sitrus Berry change the race; subsequent predictions use their consumed state. |
| Toxic counters | Residual damage and escalating counters stay consistent at multiple starting stages. |
| Protect | A protected turn delays damage; an immediate winning continuation remains inside an unfinished forecast's bounds. |
| Observation streams | Both worker modes handle normal, four-times-faster and immediate-burst synthetic state submissions, suppress stale callbacks and produce a reading for the final state. |

The stream tests use 80 ms, 20 ms and zero-delay submissions. They do not launch or drive mGBA and do not establish real emulator fast-forward compatibility. All fixtures are synthetic; tests do not open a player's game, save, or private battle recordings.

## Issue found

The NPC Protect check rounded toxic damage after multiplication. The native mechanics and the locally available battle-util reference round the base tick first. At 100 maximum HP and the fourth toxic tick, this is `floor(100 / 16) * 4 = 24`, not `floor(100 * 4 / 16) = 25`. The latter incorrectly vetoed Protect at 25 HP. The importer now preserves base-tick rounding and its minimum-one-damage rule.

Known exact scenarios require exact agreement. Sampled deterministic scenarios allow the existing nonterminal 1%/99% display convention. A budget-limited forecast is not required to certify a complex Protect tree within a fixed wall-clock deadline; it must preserve the known winning outcome within its bounds.
