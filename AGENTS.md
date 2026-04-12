# Repository Guidelines

## Project Structure & Module Organization
`index.html` is the static entry point. `static/app/` holds ES modules: `main.js` wires state and events, `render*.js` handles UI output, `analysis.js` / `matchup-analysis.js` / `recommendations.js` contain domain logic, and `showdown.js` parses or exports team text. `static/css/` contains layered styles (`base.css`, `layout.css`, `shell.css`, `analysis.css`, `matchup.css`). Checked-in data lives in `poke_analysis-main/stats/`; refresh it with `poke_analysis-main/update_all_data.py` rather than editing JSON by hand. `docs/` stores reference notes only.

## Build, Test, and Development Commands
There is no build step. Run the app through a local static server because modules and `fetch` do not work reliably from `file://`.

- `python -m http.server 8000` starts local development at `http://localhost:8000`.
- `node --check static/app/main.js` runs a syntax check; use it on every edited JS file before committing.
- `python -m py_compile poke_analysis-main/update_all_data.py` validates the Python updater.
- `python poke_analysis-main/update_all_data.py` refreshes bundled Showdown data and icon sheets. Requires Python and `requests`.

## Coding Style & Naming Conventions
Use 2-space indentation in HTML, CSS, and JavaScript. Prefer ES modules, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for constants such as `MAX_TEAM_SIZE`. Keep orchestration in `main.js`, rendering in `render*.js`, and reusable battle logic in focused modules like `team-roles.js`. Favor small pure helpers over deep nesting. Do not add silent fallbacks; let failures surface clearly for debugging.

## Testing Guidelines
No automated test framework is committed yet. After frontend changes, manually verify library import/export, team analysis, matchup analysis, recommendations, and speed tiers in the browser. After logic edits, run `node --check` on each touched module. After data refresh work, confirm the page still loads and the updated files under `poke_analysis-main/stats/` are intentional.

## Commit & Pull Request Guidelines
Recent history uses short imperative subjects, sometimes with a conventional prefix (`feat:`), for example `Refine UI and add team import translation bridge`. Keep commit messages focused and specific to one change. PRs should include a brief summary, the affected views or modules, manual verification steps, and screenshots for visible UI changes. If a PR updates generated data, call out which files in `poke_analysis-main/stats/` were regenerated and why.
