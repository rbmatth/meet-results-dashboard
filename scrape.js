#!/usr/bin/env node
'use strict';

// Scrape HY-TEK Meet Manager result pages for a meet into results/<MEET>/ — the
// directory parse_meet.js consumes. Replaces the wget-based scrape.sh; zero npm
// dependencies (Node >= 22 global fetch).
//
// Usage:   node scrape.js <MEET_ID> [out-dir] [options]
// Example: node scrape.js 2026CSA
//          node scrape.js 2026CSA results/2026CSA --concurrency 8
//
// Options:
//   --base <url>        Site root (default https://meetresults.greensboroaquaticcenter.com/)
//   --concurrency <n>   Parallel downloads (default 4)
//   --limit <n>         Cap the number of result pages fetched (for testing)
//   --skip-existing     Keep files already on disk instead of re-fetching
//   --archive           Also write <MEET>_<timestamp>.tar.gz of the output dir
//
// Pages already on disk are re-fetched conditionally (If-Modified-Since from the file
// mtime) and rewritten only when the content actually differs, so a refresh reports
// exactly which pages changed.
//
// The frameset entry pages (index.html, evtindex.htm, main.htm) are always fetched;
// every same-directory .htm/.html page linked from evtindex.htm (the result and nav
// pages) is then discovered and downloaded. External and absolute links are ignored.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_BASE = 'https://meetresults.greensboroaquaticcenter.com/';
const ENTRY_PAGES = ['index.html', 'evtindex.htm', 'main.htm'];

function parseArgs(argv) {
  const opts = { base: DEFAULT_BASE, concurrency: 4, limit: Infinity, skipExisting: false, archive: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') opts.base = argv[++i];
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]);
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--skip-existing') opts.skipExisting = true;
    else if (a === '--archive') opts.archive = true;
    else if (a.startsWith('--')) fail(`Unknown option: ${a}`);
    else positional.push(a);
  }
  opts.meetId = positional[0];
  opts.outDir = positional[1] || path.join('results', opts.meetId || '');
  if (!opts.meetId) fail('Usage: node scrape.js <MEET_ID> [out-dir] [options]');
  return opts;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// Same-directory page links only: "260709F001.htm", "evtindex.htm". Rejects
// absolute URLs ("http://…", "/2026CSA/0") and anchors/subpaths (anything with a slash).
function pageLinks(html) {
  const out = new Set();
  const re = /(?:href|src)="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (/^[\w.-]+\.html?$/i.test(href)) out.add(href);
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'meet-manager-scraper' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

// Conditionally download url into dest. Returns 'new', 'changed', or 'unchanged'.
// Sends If-Modified-Since from the existing file's mtime; if the server ignores it
// (no 304), falls back to comparing content before rewriting.
async function download(url, dest) {
  const headers = { 'User-Agent': 'meet-manager-scraper' };
  const exists = fs.existsSync(dest);
  if (exists) headers['If-Modified-Since'] = fs.statSync(dest).mtime.toUTCString();
  const res = await fetch(url, { headers });
  if (res.status === 304) return 'unchanged';
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (exists && fs.readFileSync(dest, 'utf8') === text) return 'unchanged';
  fs.writeFileSync(dest, text);
  return exists ? 'changed' : 'new';
}

// The frameset is served at the directory URL (…/<MEET>/), not at /index.html, so
// index.html is fetched from the meet root; every other page maps to <root><page>.
function pageUrl(meetBase, page) {
  return page === 'index.html' ? meetBase : meetBase + page;
}

// Run `worker` over `items` with at most `concurrency` in flight.
async function pool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const meetBase = new URL(`${opts.meetId}/`, opts.base).href;
  fs.mkdirSync(opts.outDir, { recursive: true });

  console.log(`Scraping ${meetBase} -> ${opts.outDir}/`);

  // 1. Fetch the event index and discover the result/nav pages it links to.
  // (Written only when changed, so its mtime stays meaningful for If-Modified-Since.)
  const indexHtml = await fetchText(meetBase + 'evtindex.htm');
  const indexDest = path.join(opts.outDir, 'evtindex.htm');
  if (!fs.existsSync(indexDest) || fs.readFileSync(indexDest, 'utf8') !== indexHtml) {
    fs.writeFileSync(indexDest, indexHtml);
  }

  const discovered = [...pageLinks(indexHtml)].filter((p) => !ENTRY_PAGES.includes(p)).sort();
  const resultPages = discovered.slice(0, opts.limit);
  const pages = [...ENTRY_PAGES.filter((p) => p !== 'evtindex.htm'), ...resultPages];

  console.log(`Found ${discovered.length} linked page(s); fetching ${pages.length} + evtindex.htm`);

  // 2. Download each page (bounded concurrency), skipping existing files if asked.
  const tally = { new: 0, changed: 0, unchanged: 0, skipped: 0, failed: 0 };
  const changedPages = [];
  await pool(pages, opts.concurrency, async (page) => {
    const dest = path.join(opts.outDir, page);
    if (opts.skipExisting && fs.existsSync(dest)) {
      tally.skipped++;
      return;
    }
    try {
      const status = await download(pageUrl(meetBase, page), dest);
      tally[status]++;
      if (status !== 'unchanged') changedPages.push(page);
    } catch (e) {
      tally.failed++;
      console.warn(`  ! ${page}: ${e.message}`);
    }
  });

  const fetched = tally.new + tally.changed + tally.unchanged;
  console.log(
    `Done: ${fetched} fetched (${tally.new} new, ${tally.changed} changed, ` +
    `${tally.unchanged} unchanged), ${tally.skipped} skipped, ${tally.failed} failed.`,
  );

  // 3. Optional snapshot tarball (matches the old scrape.sh behavior).
  if (opts.archive) {
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const tgz = `${opts.meetId}_${ts}.tar.gz`;
    execFileSync('tar', ['-czf', tgz, '-C', path.dirname(opts.outDir), path.basename(opts.outDir)]);
    console.log(`Wrote ${tgz}`);
  }

  if (tally.failed) process.exitCode = 1;
}

main().catch((e) => fail(e.stack || String(e)));
