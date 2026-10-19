# Automated tests

Run the complete correctness suite from the repository root:

```powershell
node --test --test-concurrency=2
```

`npm test` runs the same command where npm is installed. Two file workers limit
CPU and memory contention, including tests that start prediction workers. This
is a correctness run, not a prediction latency benchmark.

Run a focused group by passing explicit test filenames. Helpers in `test-ground/helpers/`
create synthetic inputs; `fixtures/` contains normalized public test facts, never
personal captures or ROM/save data. Keep helpers outside `test/`: Node discovers
every JavaScript file there, even one without test declarations. Tests that start a reader or bridge use
temporary directories and close only their own processes.

## What belongs here

* Assert an externally meaningful result, an independent probability, a state
  change, or an explicit safety condition. A bounded finite value alone does not
  prove that a predictor is correct.
* Include a positive case with rejection tests: always refusing an input or
  always returning `[0, 100]` must not satisfy the whole contract.
* Keep mechanics, search, worker, and observation-boundary tests when they catch
  different faults. Sharing a move name does not make two tests redundant.
* Use independent formulas or restricted reference solvers for exact targets.
  Never freeze a prediction engine's output as its own accuracy target.
* Assert readiness/completion before comparing a sampled result to an exact
  target. Use generous correctness work budgets. Test cancellation and slicing
  with explicit work/node limits where possible.
* Do not assert source filenames, fixture counts, or fixture constants merely to
  preserve the current layout. Protocol source checks must state their limits.

## Separate performance measurements

`scripts/benchmark-retained-turn.mjs`, `scripts/benchmark-search-race.mjs`, and
`scripts/benchmark-bound-pruning.mjs` measure search performance. Reference and
stall acceptance tests validate the measurement/reporting rules. The initial
estimate goal is now under 300 ms and within ten percentage points, then
refinement; a green correctness suite does not establish that goal for every
battle. Compare timings on the same machine under comparable load.

Use `--group=broad --mode=hybrid` with the retained-turn benchmark for the
four-by-four, Herdier/Wingull and persistent-effects workloads. For a controlled
comparison, run separately with `--feature-probe-reuse=off` and `on`. Every row
records the setting. These cases currently lack independent probability
references, so their latency improvements do not establish ten-point accuracy.

`feature-probe-reuse.test.mjs` compares optimized capability evaluations against
uncached native execution across first-turn outcomes, HP/PP variations and
HP-sensitive interactions. It also verifies that eligible probes actually get
reused and that active passive effects retain native timelines.

## Limits

Most tests called “native” execute the vendored battle engine, not the GBA ROM.
Independent algebra/calculator cross-checks protect selected mechanics and
restricted probability problems. The numeric battle-message fixture was
captured from isolated Run & Bun 1.07 engine replays. Neither source-text Lua
checks nor synthetic capture delivery tests execute Lua in mGBA. Browser
controller tests execute real rendering/controller code with controlled browser
I/O; visual layout and native overlay controls still need their separate manual
checks in `test-ground/`.

`meter-animation.test.mjs` also executes the desktop overlay's real PowerShell
update/animation functions on Windows without loading forms or starting a
reader. Controlled animation times verify first readings, both rails and labels,
retargeting and resets. The browser tests control animation frames explicitly.

See [the October review](../analysis/TEST-REVIEW.md) for the file-by-file audit.
