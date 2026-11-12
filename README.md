# Meet Results Dashboard

A browsable dashboard for swim-meet results. It turns the HY-TEK Meet Manager result pages that a meet publishes online into an Angular web app with standings, event results, swimmer and team pages, and predicted and improvement views.

**Live site:** https://rbmatth.github.io/meet-results-dashboard/

## What it does

- Scrapes a meet's published result pages (about 180 fixed-width HTML pages per meet).
- Parses them into a normalized SQLite database.
- Exports per-meet JSON that the web app loads at runtime.
- Scores everything in the browser: team, group and swimmer standings, standings predicted from seed times, and improvements.
- Treats **Championship** and **Open** as separate competitions, each with its own point table and standings (`/<meet>/<division>/<view>`, for example `/2025CSA/championship/scores`).
- Keeps an open tab live: the app polls for new data and reloads the active meet when it changes.

## How it fits together

```
scrape.js       ->  results/<MEET>/*.htm      scraped pages
parse_meet.js   ->  meets.db                  normalized SQLite (schema.sql)
export_json.js  ->  web/public/data/*.json    one payload per meet, plus index.json
web/            ->  Angular app that reads the JSON (never the database)
```

The pipeline is plain Node with no npm dependencies. It uses the built-in `node:sqlite`, so it needs **Node 22.5 or newer**. The web app lives in `web/` and has its own `package.json` (Angular 22).

Details of the data model are in [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) and [`schema.sql`](schema.sql). Read them before changing the parser.

## Getting started

The database, the scraped pages and the archives are not in git, so a fresh clone has to build them first.

```bash
# 1. Scrape and build the data
node scrape.js 2025CSA                          # pages -> results/2025CSA/
node scrape.js 2026CSA                          # pages -> results/2026CSA/
npm run build:data                              # parse both meets, then export the JSON

# 2. Run the web app
cd web
npm install
npm start                                       # http://localhost:4200 (also served on the LAN)
```

`build:data` expects both `results/2025CSA` and `results/2026CSA`.

## Commands

Run from the repository root unless noted.

| Command | What it does |
|---|---|
| `npm run refresh` | Scrape, parse and export one meet in one step, with a summary of what changed. Defaults to the newest meet under `results/` |
| `npm run refresh:loop` | Repeat `refresh` on an interval and, when the data changes, **commit and push** `web/public/data`. For a live meet only |
| `node scrape.js <MEET>` | Download a meet's pages. Options include `--skip-existing`, `--limit N` and `--archive` (writes a tarball to `archives/`) |
| `node parse_meet.js results/<MEET> meets.db` | Load one meet into the database. Safe to re-run, since it replaces that meet's rows |
| `node export_json.js meets.db web/public/data` | Export every meet to JSON |
| `npm test` | Parser tests (`node:test`, with real-page fixtures in `test/`) |
| `cd web && npm test` | Web app tests, including the scoring engine |
| `cd web && npm run build` | Production build |

After changing source data, run both the parse and the export. The web app only reads the JSON.

## Updating the live site

The site is hosted on GitHub Pages and deploys from every push to `main`. CI runs the tests, builds the app with `--base-href /meet-results-dashboard/` and publishes it. It never scrapes or parses.

So the exported JSON in `web/public/data/` is tracked in git, and updating the site's data means:

```bash
npm run refresh
git add web/public/data
git commit -m "data: refresh <MEET>"
git push
```

`npm run refresh:loop` does this automatically on an interval.

## Repository layout

| Path | What it holds |
|---|---|
| `scrape.js`, `parse_meet.js`, `export_json.js`, `refresh.js`, `refresh-and-push.js` | The data pipeline |
| `schema.sql` | Database schema |
| `test/` | Parser tests and fixtures |
| `docs/` | Domain model |
| `web/` | The Angular app |
| `web/public/data/` | Exported JSON (tracked) |
| `.github/workflows/deploy.yml` | Test, build and deploy to GitHub Pages |

## Notes

- Swimmers have no ID in the source data, so a swimmer is identified by meet, team, last name and first name. Misspellings in the source create duplicate swimmers.
- The parser skips pages that aren't results (psych sheets, "not available" placeholders). A snapshot taken mid-meet loads only the events that have finished.
- Meet results are scraped from the public results site of the meet's host. The scraper fetches a few pages at a time, so keep it that way.
