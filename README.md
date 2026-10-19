# Poképulse

Poképulse is Game Rater's live battle win-probability meter for Pokémon Run & Bun 1.07.

It reads battle observations through an mGBA Lua bridge, searches possible turns, and displays a whole-number percentage. Estimates refine while the battle remains on the same decision. The menu offers a community NPC AI model as an alternative to the default opponent model.

## Run from source

Install Node.js 20 or newer and pnpm. From this repository's root:

```sh
pnpm install --frozen-lockfile
pnpm start:run-bun
```

Open http://localhost:3001/. In mGBA, load your own Run & Bun game and load the generated `run-bun/PokeThreat.lua` through the scripting window. Keep the server running. ROMs, saves, emulator installations, and private battle reports are not included.

The Windows launchers belong to the packaged desktop distribution and expect its bundled files. A source checkout uses the commands above.

On the desktop overlay, open **⋯ → Connection and status** to see whether the
reader is connected, receiving fresh game data, calculating or missing required
information. The panel includes the last game-update and prediction times.

## Scope

The prediction concerns the current active matchup. It does not calculate full-team odds or plan switch-ins. Search may use sampled outcomes and heuristic continuations. Community calculator and NPC AI behavior are adapted for Run & Bun; this does not establish complete parity with the ROM.

The performance goal is a useful first estimate in under 300 ms on a ready worker, within ten percentage points of the correct probability, followed by refinement. Worker startup is measured separately. This is a development goal, not a guaranteed accuracy or latency specification.

## Development

```sh
pnpm test
pnpm audit:scenarios
pnpm benchmark:search
pnpm benchmark:race
pnpm benchmark:pruning
```

See `analysis/MECHANICS-OWNERSHIP.md`, `analysis/SCENARIO-AUDIT.md`, `analysis/CONTINUATION-POLICY.md`, `analysis/PERFORMANCE-TARGETS.md`, and `SEARCH-BENCHMARKS.md` for design and audit notes.

Keep bug reports and live captures local. Share synthetic reproductions when reporting issues publicly.

## Upstream projects

Vendored components retain their own licenses and source records under `vendor/`. See `THIRD_PARTY_NOTICES.md`. Pokémon and Run & Bun belong to their respective owners; this is an independent community tool.
