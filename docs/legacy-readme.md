# PokéThreat Meter

A local streamer tool with a compact animated **Victory outlook** bar. Higher favors your Pokémon. The simple manual app and the automatic Run & Bun preview are separate applications. Source runs require Node.js 20+; the Windows download includes Node.

## Automatic Run & Bun preview

Run `node run-bun/server.mjs`, then open [the control page](http://127.0.0.1:3001/). The portable Windows bundle is `dist/Pokethreat-Meter-Portable-Windows.zip`: extract it fully and choose `Start PokéThreat Meter.cmd` for manual matchups or `Start Run and Bun.cmd` for the experimental automatic preview. The bundle includes Node.js and the calculator dependency.

For a compact desktop overlay window, run Start PokéPulse Overlay.cmd from the extracted folder. It opens a small draggable, transparent window that reads the same live estimate and can be captured as a window source in OBS; right-click it to hide or close it. The full control page remains available for setup and detailed analysis.

1. Open your existing Run & Bun 1.07 ROM and save in **mGBA 0.10.5**.
2. Start the meter. Use `run-bun/PokeThreat.lua`, generated at startup, or **Download integration** on the control page.
3. In mGBA, open **Tools → Scripting → File → Load script** and select that file. Load it once, then play normally. If the file dialog fails, enter `dofile("C:/path/to/app/run-bun/PokeThreat.lua")` in mGBA's scripting prompt.
4. Add [the audience overlay](http://127.0.0.1:3001/?overlay=1) as an OBS Browser Source at **400 × 64**.

Analysis starts hidden on the control page. The saved **Hide analysis from me** preference affects the streamer page only. Viewers retain their overlay. The bar clears outside battle, with unsupported data, after four seconds without emulator captures, or if the server disconnects. Reload the integration after moving the app or opening another ROM. Restarting the meter at the same path reconnects without needing a game restart.

The adapter reads both active Pokémon automatically: species, exact HP and maximum HP, actual in-game stats, stat stages, abilities, held items, major status, moves and PP. It uses the separate battle-active flag because battler data persists after battles. It follows active battler changes instead of assuming the first party member is on the field. The adapter accepts ROM CRC32 `0b5a9694`, verified against SHA-256 `68ec5b0c02e6def8da8dc2b1857b269505418803d44cc2b816fb7471587bf89d`. Other ROM revisions are explicitly unsupported.

**This is an experimental automatic preview.** It reads exact HP/stats, moves/PP, abilities/items, stat stages, major status, rain/sun/sand/hail, all four terrains, Reflect, Light Screen, Tailwind, Trick Room, Taunt, Disable and Encore. An unverified weather value clears the estimate. Choice locks, multi-turn moves and other temporary effects remain unverified. Double battles are explicitly unsupported. The percentage uses bounded stochastic search over the active matchup, including supported recovery, setup, status, held items, move secondary effects, accuracy and independent critical rolls per hit. Zero PP makes a move unavailable and exhaustion uses Struggle. Recoil, survival/contact triggers, Protect/Substitute, supported conditional/multi-turn attacks, weather damage and effect expiry also participate in re-estimation. Missing counters and unsupported callbacks remain unresolved. Switching, full teams and trainer AI remain excluded. See analysis/MECHANICS.md for the supported scope and live verification limits. A fainted active opponent produces 100 for that matchup, even if a trainer has more Pokémon. The estimate concerns the modeled active matchup and does not prove the full trainer battle is won.

Status affects the next action: ordinary attacks are blocked while the live sleep counter indicates the Pokémon remains asleep, with Early Bird and Snore exceptions. Freeze branches on a 20% thaw chance, with self-thawing and supported opposing thawing moves. Paralysis branches on a 75% action chance in addition to the calculator's speed reduction. Raw damage ranges remain conditional on acting and hitting. Supported sleep and confusion durations branch through future turns. Sleep Talk's randomly called moves remain unsupported. Status-aware score logic has automated coverage; live sleep-counter timing still needs gameplay validation. Rules follow the [creator's mechanic changes](https://drive.google.com/file/d/1NMIafT_5Gl2ebmuP3AnCwAMpW0YItysH/view) and its Generation 8 default.

The Lua integration reads game memory and writes two local bridge files under this installation's `run-bun/live/` directory. It never writes game memory, controller inputs, the ROM, saves, or save states. No network connection or emulator process-memory permissions are required. Keep the server running and install in a writable folder. Use `POKETHREAT_BRIDGE_DIR` to change the bridge directory before starting. Captures from before server startup are ignored. Packets have versioned headers and matching sequence footers so partial writes cannot update the bar.

Architecture: `run-bun/integration.mjs` generates the read-only mGBA script; `run-bun/bridge.mjs` handles local transport/freshness; `run-bun/memory.mjs` decodes game RAM without scoring or I/O; `run-bun/input.mjs` validates normalized snapshots; `run-bun/profile.mjs` supplies game mechanics; `analysis/threat.mjs` calculates with a supplied calculator. Actual-stat overrides survive calculator clones. SSE updates send compact active-battle state and recalculate only when battle data changes.

Build the combined portable bundle with `scripts/package-portable.ps1 -NodePath <absolute-path-to-node.exe> -OutputDirectory <absolute-output-directory>`. The package includes the manual app and experimental Run & Bun preview, runtime, dependencies, and their license files. It explicitly selects adapter files and excludes ROMs, saves, states, memory captures, and emulator tools. It refuses to overwrite existing package output.

References: [mGBA 0.10.5 core API](https://github.com/mgba-emu/mgba/blob/0.10.5/include/mgba/core/core.h), [mGBA scripting](https://mgba.io/docs/dev/scripting.html), [creator's export script](https://drive.google.com/file/d/1W5mbkQLmrA2w8XhFfFvfFbwMbHa1tRjC/view), [Run & Bun community calculator](https://github.com/ForwardFeed/runbuncalc). The development scripting docs include features absent from 0.10.5; the integration uses APIs tested in 0.10.5. `run-bun/reference/adapter-profile.json` records provenance and remaining validation gaps.

## Simple manual app

```sh
node server.mjs
```

For source runs, install dependencies with `npm install` or `pnpm install --frozen-lockfile` before starting. Open http://127.0.0.1:3000. Search two Pokémon, select mechanics, or swap sides. The portable bundle includes `Start PokéThreat Meter.cmd`, so a separate Node install is not needed for that download. No build step is needed. Run `node --test` for engine checks. Set `PORT` to change the port. The pnpm lockfile records the installed calculator version.

## OBS

Add a Browser Source with URL http://127.0.0.1:3000/?overlay=1, width 400, height 64. Only the victory-outlook bar and score appear on its transparent background. Low outlook is red; high outlook is green. Keep `node server.mjs` running; changing selections, HP, builds, or field conditions updates all overlays through server-sent events. Animation lasts 650 ms and respects reduced motion. Disconnection hides the numeric score and dims the stale bar. The server binds only to localhost. All state resets on server restart.

HP is manually entered as remaining percent; no emulator or game capture is connected. New selections reset HP. Swap sides also swaps HP, builds, and side conditions. Changing mechanics resets builds/field to compatible defaults. Reset HP starts both sides at 100%. Future game adapters can post partial updates to `/api/state`, e.g. `{"battle":{"player_hp":40,"opponent_hp":75}}`. Partial build stat tables and field side conditions are also merged. Invalid inputs do not replace active state.

## Damage-based victory outlook

### Streamer visibility

Enable **Hide analysis from me** on the control page to hide its bar, damage reports, explanations, suggested moves/build editors, and species stat/type hints. Pokémon selection and HP controls still update the audience overlay. This preference is stored locally in that browser, restored on reload, and synchronized between control tabs at the same origin. Viewer overlays ignore it and stay visible. It does not hide an OBS preview or an audience overlay that the streamer opens separately. Configure advanced battle inputs before enabling this mode.

The server uses [Smogon's damage calculator](https://github.com/smogon/damage-calc), via `@smogon/calc`, to calculate both sides' selected moves with generation-specific formulas and supplied species data. Inputs include level, nature, EVs, IVs, current HP, boosts, moves, abilities, optional held items, status, forced critical damage, weather, terrain, Reflect, Light Screen, Tailwind, and Trick Room.

Damage ranges are shown as percentages of target maximum HP. KO-on-hit annotations identify whether all/some modeled damage rolls KO at current HP. They do not account for missing or being unable to act, and are not overall KO probabilities.

Defaults: level 50, Serious nature, 31 IVs, 0 EVs, no item/ability, healthy, no boosts. Suggested moves use species/form and inherited learnset pools across games, restricted to moves present in the selected calculator generation. These are assumptions, not observed moves or a legality check for a specific game. Edit the inputs to match the battle.

For each side, choose its highest-pressure move. Pressure is the midpoint damage range divided by target current HP. The audience score is `clamp(100 × your pressure / total pressure + 10 × turnOrder, 1, 99)`. Both pressures zero gives a neutral share. Turn order is +1 for your selected move acting first, -1 for theirs, and 0 for a tie, using move priority and effective Speed with Trick Room reversing speed order.

**The outlook is an advantage index, not a win probability or proof of a winning strategy.** Active battles stay between 1 and 99. Opponent fainted gives 100; player fainted gives 0; simultaneous faint gives 50. Proving a guaranteed winning path needs turn simulation, opponent choices, randomness, and explicit unknown-information assumptions.

Accuracy/evasion, PP, secondary effects, move legality, future turns, switching, teammates, setup strategy, healing, recoil, and end-of-turn residual damage are not simulated by the outlook. Status inputs affect damage/speed modifiers supported by the library; sleep/freeze action prevention is not simulated. Status moves carry a warning that their strategic effects are not scored. Forced critical inputs model critical damage, not likelihood. Turn-order estimates do not model conditional priority abilities or random item order effects.

Species weights come from the pack or calculator data. Unknown species without weightkg use an assumed 100 kg with a warning. Future adapters can supply build data via POST `/api/state`, e.g. `{"builds":{"player":{"moves":["Earthquake","Dragon Claw"],"nature":"Adamant","evs":{"atk":252}}},"field":{"weather":"Rain","opponent":{"reflect":true}}}`.

## Legacy heuristic / custom-mechanics fallback

Directional threat is from the first Pokémon's perspective. For each side, take the strongest assumed STAB pressure:

`pressure = attacking base stat / matching defensive base stat × 100 / defending base HP × type effectiveness`

Classic mechanics choose physical or special based on attack type. Modern mechanics try both categories for each STAB type; this is an optimistic offensive potential assumption, not a claim about actual move availability. Equal level, move power, and STAB are assumed. Offense, Defense, Special Attack, Special Defense, HP, and Speed all contribute.

`share = opponent pressure / (opponent pressure + player pressure)`; both pressures zero gives 0.5.

`speedEdge = (opponent Speed - player Speed) / (opponent Speed + player Speed)`

`inherent = clamp(50 + 90 × (share - 0.5) + 15 × speedEdge, 0, 100)`

`difficulty = 100 × (inherent × opponent HP%) / (inherent × opponent HP% + (100 - inherent) × player HP%)`

Difficulty is calculated continuously and displayed with one decimal place. At equal remaining HP, it preserves the starting inherent matchup score. Opponent fainted gives 0, player fainted gives 100, both fainted gives 50. The HP adjustment is a tension heuristic and does not simulate turns, damage rolls, or literal victory odds.

Legacy Threat 0–4 and difficulty fields remain diagnostic for compatibility. **Use result.victory for the audience bar.** Incompatible custom damage rules use a visibly labeled heuristic fallback and invert this legacy difficulty direction; they never silently receive standard-game damage calculations.

The fallback heuristic excludes actual moves, items, ability effects, levels, EVs/IVs, switching, and team context. These are limitations of the fallback, not the main damage-calculation adapter.

## Architecture

- `data/pokedex.json`: normalized species and forms, separate from mechanics.
- `data/type-chart.json`: modern attacking-type → defending-type multipliers.
- `engine.mjs`: pure mechanics presets, validation, offensive pressure, threat bucketing, explanations.
- `battle-engine.mjs`: calculator adapter, build/field validation, move damage reports, and victory outlook.
- `data/battle-data.json`: learnset pools and move accuracy metadata. Refresh with `node scripts/import-battle-data.mjs` (network required).
- `scripts/import-showdown.mjs`: upstream Pokémon Showdown adapter. Run `npm run data` to refresh the checked-in snapshot (requires network).
- `server.mjs`: localhost static server and shared matchup state / event stream.
- `app.mjs`, `index.html`, `style.css`: selection UI and overlay.

The selector supports standard generations 3–9. Species are not filtered by generation: ROM hacks can mix later species with earlier mechanics. **Bundled species always use modern base stats and modern typing**. Import accurate historical or hack data when needed. Custom type charts and physical/special splits are checked against the calculator generation; incompatible mechanics explicitly fall back with a warning. Custom formulas, moves, and ability behavior need future dedicated adapters. Gen 1/2 are not implemented.

## Custom JSON packs

Import a JSON object with `name` and `species`. The stats keys are `hp`, `atk`, `def`, `spa`, `spd`, `spe`; stats must be integers from 1–999, species IDs unique. Example: `examples/custom-pack.json`.

Optional species fields include positive `weightkg` and `moves` (names/IDs used as the default move suggestion pool).

Optional `rules` specifies `generation` (positive integer), `available_types` (array), `physical_special_split` (boolean), and a complete `type_chart` (numeric nonnegative multipliers for every attacking/defending type pair). Example: `examples/custom-rules-pack.json`. Custom rules are independent of the generation number; the engine consumes the explicit chart and split. Additional damage formulas and ability rules need future engine implementations, not just data fields. Type-based splitting currently supports the original 17 types. Custom types require move-based splitting.

Imports are validated before replacing active data; user JSON is never evaluated as code. GBA decomp and CSV adapters are future ingestion paths, not implemented in this prototype.

## Data and assets

Species and the type chart come from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown), with import date recorded in the data file. Consult its [license](https://github.com/smogon/pokemon-showdown/blob/master/LICENSE) before redistribution. Pokémon names are used for identification; this is an unofficial fan tool. The interface uses CSS visuals and optional Google Fonts; system fonts work offline. Scoring and the bundled dataset require no external API at runtime.

The calculator is [@smogon/calc](https://github.com/smogon/damage-calc), distributed under the MIT license; see its installed LICENSE in node_modules. Related references include [Showdex](https://github.com/doshidak/showdex) and the historical [Pokémon Battle Predictor](https://aed3.github.io/projects/pokemon-battle-predictor/); neither is a dependency.

Verification: `node --test` runs engine/integration checks, `node scripts/smoke.mjs` checks the running server, and `node scripts/check-catalog.mjs` exercises compatible bundled species under modern and classic mechanics.

To report a Poképulse bug during play, press **Ctrl+Shift+B**. The overlay's three-dot menu also includes **Report bug**. Reports are saved locally.


