#!/usr/bin/env node
'use strict';

// Local "live meet" loop: re-run refresh.js (scrape -> parse -> export) on an interval,
// and whenever the exported JSON actually changed, commit + push it so the deployed
// GitHub Pages site (and anyone with the site open — see DataService's client-side
// poll) picks up the new data on its own. Meant to be left running on your machine for
// the duration of a live meet; Ctrl+C to stop.
//
// Usage:   node refresh-and-push.js [MEET_ID] [interval-seconds]
// Example: node refresh-and-push.js 2026CSA 300
// Defaults: MEET_ID = newest dir under results/ (same default as refresh.js),
//           interval = 300s (5 min) — be a reasonable neighbor to the results site.

const path = require('path');
const { execFileSync } = require('child_process');

const meetId = process.argv[2] || '';
const intervalSec = Number(process.argv[3]) || 300;
const dataDir = path.join('web', 'public', 'data');

function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function capture(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

function refreshAndPush() {
  const stamp = new Date().toISOString();
  console.log(`\n===== ${stamp} — refreshing${meetId ? ` ${meetId}` : ''} =====`);
  try {
    run('node', [path.join(__dirname, 'refresh.js'), ...(meetId ? [meetId] : [])]);
  } catch (e) {
    console.error(`refresh.js failed: ${e.message}`);
    return;
  }

  const changed = capture('git', ['status', '--porcelain', '--', dataDir]);
  if (!changed) {
    console.log('No data changes — nothing to commit.');
    return;
  }

  console.log('Data changed, committing + pushing:\n' + changed);
  try {
    // Commit ONLY the data dir via an explicit pathspec (not `git add` + bare commit),
    // so a bare `git commit` can't sweep up whatever else happens to be staged in the
    // working tree — e.g. source edits in progress in another session.
    run('git', [
      'commit',
      '-m',
      `data: refresh ${meetId || 'meet'} ${stamp}\n\nAutomated commit from refresh-and-push.js.`,
      '--',
      dataDir,
    ]);
    run('git', ['push']);
  } catch (e) {
    console.error(`git commit/push failed: ${e.message}`);
  }
}

console.log(
  `Starting refresh loop${meetId ? ` for ${meetId}` : ' (newest meet under results/)'}, ` +
  `every ${intervalSec}s. Ctrl+C to stop.`,
);
refreshAndPush();
const timer = setInterval(refreshAndPush, intervalSec * 1000);
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nStopped.');
  process.exit(0);
});
