#!/usr/bin/env node
'use strict';

// Export meets.db into per-meet JSON files the Angular SPA loads at startup.
//
// Usage:  node export_json.js [db-path] [out-dir]
// Default: node export_json.js meets.db web/src/assets/data
//
// Emits <meetcode>.json for every meet plus index.json (the list of meets).
// Results are denormalized: team_id is copied onto every result, times are carried
// as both centiseconds (_cs) and the original display string (_raw), and relay legs
// and splits are nested on their result.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.argv[2] || 'meets.db';
const outDir = process.argv[3] || path.join('web', 'public', 'data');

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}. Run: node parse_meet.js results/<MEET> ${dbPath}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const db = new DatabaseSync(dbPath);
const all = (sql, ...p) => db.prepare(sql).all(...p);

const meets = all('SELECT meet_id, code, name, facility, location, start_date, end_date, course FROM meet ORDER BY start_date');
const index = [];

for (const meet of meets) {
  const mid = meet.meet_id;

  const teams = all(
    `SELECT DISTINCT t.team_id AS id, t.code, t.lsc
     FROM team t
     WHERE t.team_id IN (SELECT team_id FROM swimmer WHERE meet_id = ?)
        OR t.team_id IN (SELECT rl.team_id FROM relay rl
                         JOIN event_round er ON er.round_id = rl.round_id
                         JOIN event e ON e.event_id = er.event_id WHERE e.meet_id = ?)
     ORDER BY t.code`, mid, mid);

  const swimmers = all(
    `SELECT swimmer_id AS id, team_id, full_name AS name, gender, age
     FROM swimmer WHERE meet_id = ? ORDER BY full_name`, mid);

  const events = all(
    `SELECT event_id AS id, event_number AS number, gender, age_group_label AS age_group,
            min_age, max_age, distance, stroke, course, is_relay, division, title
     FROM event WHERE meet_id = ? ORDER BY event_number`, mid);

  // All result rows across all rounds, with the owning event/round context and the
  // effective team_id (from the swimmer for individuals, from the relay for relays).
  const resultRows = all(
    `SELECT r.result_id AS id, e.event_id AS event_id, e.division AS division,
            er.round_type AS round_type, e.is_relay AS is_relay,
            r.swimmer_id AS swimmer_id, r.relay_id AS relay_id,
            COALESCE(s.team_id, rl.team_id) AS team_id,
            rl.relay_letter AS relay_letter,
            r.place, r.heat_group,
            r.seed_time_cs AS seed_cs, r.seed_time_raw AS seed_raw,
            r.time_cs AS time_cs, r.time_raw AS time_raw, r.time_code AS time_code
     FROM result r
     JOIN event_round er ON er.round_id = r.round_id
     JOIN event e ON e.event_id = er.event_id
     LEFT JOIN swimmer s ON s.swimmer_id = r.swimmer_id
     LEFT JOIN relay rl ON rl.relay_id = r.relay_id
     WHERE e.meet_id = ?
     ORDER BY e.event_number, er.round_type, r.place`, mid);

  // Relay legs grouped by relay_id.
  const legsByRelay = new Map();
  for (const leg of all(
    `SELECT l.relay_id, l.leg_no, l.swimmer_id, l.swimmer_name_raw AS name, l.age
     FROM relay_leg l
     JOIN relay rl ON rl.relay_id = l.relay_id
     JOIN event_round er ON er.round_id = rl.round_id
     JOIN event e ON e.event_id = er.event_id
     WHERE e.meet_id = ? ORDER BY l.relay_id, l.leg_no`, mid)) {
    if (!legsByRelay.has(leg.relay_id)) legsByRelay.set(leg.relay_id, []);
    legsByRelay.get(leg.relay_id).push({ leg_no: leg.leg_no, swimmer_id: leg.swimmer_id, name: leg.name, age: leg.age });
  }

  // Splits grouped by result_id.
  const splitsByResult = new Map();
  for (const sp of all(
    `SELECT sp.result_id, sp.split_no, sp.distance, sp.cumulative_time_cs AS cumulative_cs, sp.interval_time_cs AS interval_cs
     FROM split sp
     JOIN result r ON r.result_id = sp.result_id
     JOIN event_round er ON er.round_id = r.round_id
     JOIN event e ON e.event_id = er.event_id
     WHERE e.meet_id = ? ORDER BY sp.result_id, sp.split_no`, mid)) {
    if (!splitsByResult.has(sp.result_id)) splitsByResult.set(sp.result_id, []);
    splitsByResult.get(sp.result_id).push({ split_no: sp.split_no, distance: sp.distance, cumulative_cs: sp.cumulative_cs, interval_cs: sp.interval_cs });
  }

  const results = resultRows.map((r) => ({
    id: r.id,
    event_id: r.event_id,
    division: r.division,
    round_type: r.round_type,
    is_relay: r.is_relay,
    team_id: r.team_id,
    swimmer_id: r.swimmer_id,
    relay: r.relay_id ? { letter: r.relay_letter, legs: legsByRelay.get(r.relay_id) || [] } : null,
    place: r.place,
    heat_group: r.heat_group,
    seed_cs: r.seed_cs,
    seed_raw: r.seed_raw,
    time_cs: r.time_cs,
    time_raw: r.time_raw,
    time_code: r.time_code,
    splits: splitsByResult.get(r.id) || [],
  }));

  const payload = {
    meet: {
      code: meet.code, name: meet.name, facility: meet.facility, location: meet.location,
      start_date: meet.start_date, end_date: meet.end_date, course: meet.course,
    },
    teams, swimmers, events, results,
  };

  const file = path.join(outDir, `${meet.code}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  index.push({ code: meet.code, name: meet.name, start_date: meet.start_date, end_date: meet.end_date });
  console.log(`Wrote ${file}  (teams=${teams.length} swimmers=${swimmers.length} events=${events.length} results=${results.length})`);
}

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`Wrote ${path.join(outDir, 'index.json')}  (${index.length} meet(s))`);
db.close();
