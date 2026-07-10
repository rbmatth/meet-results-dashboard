# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pipeline that turns scraped HY-TEK Meet Manager swim-meet result pages into a browsable
Angular SPA. Data flows in four stages:

```
scrape.sh          results/<MEET>/*.htm   (≈180 fixed-width HTML tables per meet)
parse_meet.js  →   meets.db               (normalized SQLite, schema.sql)
export_json.js →   web/public/data/*.json (denormalized per-meet payloads + index.json)
web/ (Angular) →   consumes the JSON at runtime
```

The two Node scripts and the Angular app are **separate projects** with separate
`package.json` files (root and `web/`).

## Commands

### Data pipeline (root, CommonJS, Node ≥ 22.5, zero npm deps — uses built-in `node:sqlite`)
```bash
node parse_meet.js results/2025CSA meets.db   # parse one meet dir into the DB (idempotent)
node export_json.js meets.db web/public/data  # export all meets to JSON the SPA loads
npm run build:data                            # parse both meets + export in one step
./scrape.sh                                   # re-scrape the source site (edit MEET_ID first)
```
Re-running `parse_meet.js` for a meet deletes its rows (FK cascade) and reloads — multiple
meets share one DB file. After changing source data, always re-run **both** parse and export;
the SPA reads only the JSON, never the DB.

### Web app (`cd web`, Angular 22)
```bash
npm start                 # ng serve  (localhost only; add -- --host 0.0.0.0 for LAN access)
npm run build             # production build
npm test                  # unit tests (Vitest via @angular/build:unit-test)
npx vitest run src/app/core/scoring.spec.ts   # run a single spec file
```

## Architecture

### Domain model (see `docs/DOMAIN_MODEL.md` and `schema.sql` — read these before touching the parser)
- **Times are centiseconds** everywhere (`INTEGER`): `2:19.58` → `13958`. The original display
  string is kept alongside in `*_raw` / `*_code` fields. Sort/compare on `_cs`, display `_raw`.
- **Champ prelims and finals share one `event` row** (same event number). A `session` attaches
  to an `event_round`, not the event, because prelims and finals run in different sessions.
- **`result` is a supertype**: exactly one of `swimmer_id` / `relay_id` is set (DB CHECK).
- **Swimmers have no source ID** — identity is `(meet, team, last, first)`, scoped per-meet.
  Teams are global (stable HY-TEK code). Misspellings in source data create duplicate swimmers.
- The parser skips non-results pages (Psych Sheets, "not available" placeholders), so a
  mid-meet snapshot like `results/2026CSA` loads only completed events.

### "Division" is the central UI abstraction — this is non-obvious
A single scraped meet contains **two independently-scored competitions**: Championship and Open.
The app treats **Championship and Open as separate meets**, each with its own point table and
standings. The active context is `(meet, division)`, both read from the URL:

```
/<meet>/<division>/<view>   e.g.  /2025CSA/championship/scores
```

- `DivisionService` (`web/src/app/core/division.service.ts`) parses meet + division from the URL
  and is the **only** place that builds router links — always use `div.link(...)` /
  `div.eventLink(...)`, never hand-build paths. Its `key()` (`'champ' | 'open'`) selects the
  matching field on score objects.
- Route config in `app.routes.ts` mounts the same `divisionRoutes` under both `championship`
  and `open`. `default-meet.guard.ts` redirects `/` to the first meet's Championship standings.

### Scoring engine — pure, in the browser
`web/src/app/core/scoring.ts` computes the entire `ScoreBook` (team/group/swimmer standings,
seed-based *predicted* standings, and *improvements*) as pure functions over `MeetData`. It runs
client-side, memoized via `DataService.scoreBook` (a `computed`). Key rules: Champ and Open use
different point tables; relays score 2× individual place value; ties split summed points equally;
"predicted" ranks entrants by seed time as if seeds held. This is the most logic-dense file and
has the only meaningful test suite (`scoring.spec.ts`) — keep it covered.

### Angular conventions (Angular 22, modern)
- **Zoneless** (`provideZonelessChangeDetection`) + **signals** throughout. State lives in
  signals/`computed`; components use `ChangeDetectionStrategy.OnPush`. No RxJS in components
  beyond router-event → signal bridging.
- **Standalone components only**, lazy-loaded per route via `loadComponent`.
- `DataService` is the single data layer: loads JSON, builds lookup maps (`teamById`,
  `resultsByEvent`, etc.) as `computed`s, and exposes `scoreBook`. Feature components inject it
  and derive view rows with `computed`.
- **`shared/data-table.ts` (`app-data-table`) is the standard table** — a generic sortable,
  text-filterable table driven by `Column<T>` definitions (`value` for sort/filter, optional
  `display`, `link`, `numeric`). Prefer it over hand-written `<table>` for any tabular view.
- Templates are inline in the `.ts` files. **Use plain ASCII in templates** — smart quotes and
  some Unicode glyphs break the Angular template parser (`NG5002` lexer errors).

## Deployment / hosting

No deployment is configured yet — there is no CI, host config, SSR, or git remote. The app is a
purely client-side SPA (`@angular/build:application`, no server bundle), so hosting it means
serving static files:

- **Build output**: `npm run build` (in `web/`) emits to `web/dist/web/browser/` (default path;
  `outputPath`/`baseHref` are unset). Serve the contents of `browser/` as the web root.
- **SPA fallback is required.** Routing is client-side with deep links like
  `/2025CSA/championship/scores`. The host must rewrite unknown paths to `/index.html`, or those
  URLs 404 on refresh/direct-load. On a plain static host add the equivalent (`_redirects`
  `/* /index.html 200`, `staticwebapp.config.json` navigationFallback, `try_files ... /index.html`
  for nginx, etc.).
- **Data must ship with the build.** `web/public/**` (including `data/*.json` produced by
  `export_json.js`) is copied into the build as assets. Run the data pipeline **before**
  `npm run build` so the JSON is present; the SPA fetches `data/index.json` + `data/<meet>.json`
  at runtime relative to the app root.
- **Serving from a sub-path** (e.g. `example.com/meets/`) requires
  `npm run build -- --base-href /meets/`; the default build assumes the domain root.
- The favicon lives at `web/public/favicon.ico`.

## Gotchas
- The DB and JSON are gitignored build artifacts (`meets.db`, `results/*`, `*.tar.gz`), so a
  fresh clone must run the pipeline before the SPA has data.
- `models.ts` TypeScript shapes must stay in sync with the JSON that `export_json.js` emits —
  changing the export shape means updating both.
- `is_relay` is a number (`0 | 1`) in both the JSON and the models, not a boolean.
