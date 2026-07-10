#!/usr/bin/env node
'use strict';

// One-shot refresh for a live meet: scrape -> parse -> export, with a delta summary
// of what changed since the last import. Zero npm dependencies.
//
// Usage:   node refresh.js [MEET_ID] [db-path] [out-dir]
// Example: node refresh.js 2026CSA
// Default MEET_ID: the newest directory under results/ (by name, so year-prefixed
// codes sort naturally).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const meetId = process.argv[2] || newestMeet();
const dbPath = process.argv[3] || 'meets.db';
const outDir = process.argv[4] || path.join('web', 'public', 'data');
const resultsDir = path.join('results', meetId);

function newestMeet() {
  const dirs = fs.existsSync('results')
    ? fs.readdirSync('results', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];
  if (!dirs.length) {
    console.error('No meet directories under results/. Usage: node refresh.js <MEET_ID>');
    process.exit(1);
  }
  return dirs[dirs.length - 1];
}

// Per-meet counts used for the before/after delta. Missing DB/meet -> zeros.
function meetCounts() {
  if (!fs.existsSync(dbPath)) return { events: 0, results: 0 };
  const db = new DatabaseSync(dbPath);
  try {
    const meet = db.prepare('SELECT meet_id FROM meet WHERE code = ?').get(meetId);
    if (!meet) return { events: 0, results: 0 };
    const events = db.prepare('SELECT COUNT(*) c FROM event WHERE meet_id = ?').get(meet.meet_id).c;
    const results = db.prepare(
      `SELECT COUNT(*) c FROM result r
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id WHERE e.meet_id = ?`,
    ).get(meet.meet_id).c;
    return { events, results };
  } finally {
    db.close();
  }
}

function run(script, ...args) {
  console.log(`\n>>> node ${script} ${args.join(' ')}`);
  execFileSync('node', [path.join(__dirname, script), ...args], { stdio: 'inherit' });
}

const before = meetCounts();
run('scrape.js', meetId, resultsDir);
run('parse_meet.js', resultsDir, dbPath);
run('export_json.js', dbPath, outDir);
const after = meetCounts();

console.log(
  `\nRefresh delta for ${meetId}: ` +
  `+${after.events - before.events} events (${before.events} -> ${after.events}), ` +
  `+${after.results - before.results} results (${before.results} -> ${after.results}).`,
);
