# Meet Analytics SPA

An Angular single-page app for exploring a scraped swim meet: browse and sort/filter
swimmers, teams, and events, and compute meet scoring — high scorers, team standings by
gender/age group, time improvement vs seed, and **predicted (from seed times) vs actual**.

## Data pipeline

```
results/<MEET>/*.htm ──parse_meet.js──▶ meets.db ──export_json.js──▶ web/public/data/<code>.json
                                                                            │
                                                              Angular SPA loads it at startup
```

All sorting, filtering, and scoring happen **in the browser** — there is no backend.

Regenerate the data (from the repo root) after re-scraping or schema changes:

```bash
npm run build:data      # parse results/2025CSA -> meets.db -> web/public/data/*.json
# or the two steps individually:
node parse_meet.js results/2025CSA meets.db
node export_json.js meets.db web/public/data
```

## Run the app

```bash
cd web
npm install        # first time only
npm start          # ng serve -> http://localhost:4200
npm run build      # static production bundle in dist/web/browser
npm test           # unit tests (Vitest), incl. the scoring engine
```

The production build in `dist/web/browser` is fully static and can be served by any web
server (it includes `data/`).

## Scoring rules (hardcoded)

Champ and Open events are scored **independently**, each with its own individual point
table; **relay points = individual × 2**; ties split the summed points across the tied
place range. Tables live in [`src/app/core/scoring.ts`](src/app/core/scoring.ts):

- **Champ (24):** `32 28 27 26 25 24 23 22 20 17 16 15 14 13 12 11 9 7 6 5 4 3 2 1`
- **Open (10):** `11 9 8 7 6 5 4 3 2 1`

- **Actual** score comes from the deciding round (Champ → Finals, Open → Timed Final).
- **Predicted** score re-ranks each event by entry seed time and applies the same tables.
- **Improvement** = seed time − achieved time (positive = faster than seed).

Relays contribute to team totals only; individual "high scorer" points exclude relays.

## Structure

- `src/app/core/` — `models.ts`, `data.service.ts` (signal store + lookups),
  `scoring.ts` (+ `scoring.spec.ts`), `format.ts` (time pipes).
- `src/app/shared/data-table.ts` — reusable sortable + text-filterable grid.
- `src/app/features/` — `scores`, `teams`, `swimmers`, `events`, `high-scorers`,
  `improvements` (list + detail views).
