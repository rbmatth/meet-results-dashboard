'use strict';

// Parser tests: pure-helper units plus an end-to-end load of the fixture meet
// (test/fixtures/TESTCSA) into a temp SQLite DB. Fixtures are three real scraped
// pages: an individual finals page with a tie and DQ rows (250710F003), a relay
// page with legs + splits (250710F032), and a psych sheet that must be skipped
// (260709F034), plus the 2025 evtindex.htm for session/meet metadata.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const {
  timeToCs,
  splitName,
  normalizeAgeLabel,
  parseAgeGroup,
  parseEventTitle,
  resolveTeamAlias,
  loadMeet,
} = require('../parse_meet.js');

describe('timeToCs', () => {
  test('parses seconds and minutes forms to centiseconds', () => {
    assert.equal(timeToCs('32.50'), 3250);
    assert.equal(timeToCs('1:03.48'), 6348);
    assert.equal(timeToCs('2:19.58'), 13958);
  });
  test('rejects non-times', () => {
    assert.equal(timeToCs('DQ'), null);
    assert.equal(timeToCs(''), null);
    assert.equal(timeToCs(null), null);
  });
});

describe('splitName', () => {
  test('handles "Last, First"', () => {
    assert.deepEqual(splitName('Kirby, Ella'), { last: 'Kirby', first: 'Ella', full: 'Kirby, Ella' });
  });
  test('handles "First Last" (relay leg format)', () => {
    const n = splitName('Quincy Lofton');
    assert.equal(n.last, 'Lofton');
    assert.equal(n.first, 'Quincy');
  });
});

describe('age labels', () => {
  test('normalizes the two source spellings', () => {
    assert.equal(normalizeAgeLabel('8 & Under'), '8&U');
    assert.equal(normalizeAgeLabel('15 & Over'), '15&O');
    assert.equal(normalizeAgeLabel('9-10'), '9-10');
  });
  test('parses open-ended ranges', () => {
    assert.deepEqual(parseAgeGroup('8&U'), [null, 8]);
    assert.deepEqual(parseAgeGroup('9-10'), [9, 10]);
    assert.deepEqual(parseAgeGroup('15&O'), [15, null]);
  });
});

describe('resolveTeamAlias', () => {
  test('exact match', () => {
    assert.equal(resolveTeamAlias('Hamilton Lakes-N').code, 'HL-NC');
  });
  test('prefix match handles other truncation widths', () => {
    assert.equal(resolveTeamAlias('Hamilton Lakes-NC').code, 'HL-NC');
    assert.equal(resolveTeamAlias('Hamilton Lak').code, 'HL-NC');
  });
  test('short codes stay exact-only', () => {
    assert.equal(resolveTeamAlias('PT').code, 'PT');
    assert.equal(resolveTeamAlias('PTX-NC'), null); // no 8-char prefix -> no match
  });
});

describe('parseEventTitle', () => {
  test('reads gender, age group, distance, stroke, division', () => {
    const ev = parseEventTitle('Event 3  Girls 9-10 50 Yard Backstroke Champ');
    assert.equal(ev.event_number, 3);
    assert.equal(ev.gender, 'F');
    assert.equal(ev.age_group_label, '9-10');
    assert.equal(ev.distance, 50);
    assert.equal(ev.stroke, 'BACK');
    assert.equal(ev.division, 'CHAMP');
    assert.equal(ev.is_relay, 0);
  });
  test('flags relays', () => {
    const ev = parseEventTitle('Event 32  Boys 8 & Under 100 Yard Medley Relay Champ');
    assert.equal(ev.is_relay, 1);
    assert.equal(ev.stroke, 'MEDLEY');
  });
});

describe('loadMeet (fixture meet end-to-end)', () => {
  const fixtures = path.join(__dirname, 'fixtures', 'TESTCSA');
  let tmp, dbPath, db;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-test-'));
    dbPath = path.join(tmp, 'test.db');
    const res = loadMeet(fixtures, dbPath);
    assert.equal(res.tally.parsed, 6, 'six results/psych-sheet pages parse');
    assert.equal(res.tally.skipped, 0);
    db = new DatabaseSync(dbPath);
  });
  after(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('meet metadata comes from evtindex', () => {
    const m = db.prepare('SELECT * FROM meet').get();
    assert.equal(m.code, 'TESTCSA');
    assert.equal(m.name, '2025 CSA City Meet');
    assert.equal(m.start_date, '2025-07-10');
  });

  test('psych sheet creates an ENTRY round, not a real one', () => {
    const ev = db.prepare('SELECT event_id FROM event WHERE event_number = 34').get();
    assert.ok(ev, 'event 34 exists (created from the psych sheet)');
    const round = db.prepare('SELECT round_type FROM event_round WHERE event_id = ?').get(ev.event_id);
    assert.equal(round.round_type, 'ENTRY');
  });

  test('relay psych-sheet entrant resolves via full-name team alias, no place', () => {
    const row = db.prepare(
      `SELECT r.place, r.seed_time_cs, t.code FROM result r
       JOIN relay rl ON rl.relay_id = r.relay_id
       JOIN team t ON t.team_id = rl.team_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 34 AND rl.relay_letter = 'A'
       ORDER BY r.seed_time_cs LIMIT 1`,
    ).get();
    assert.equal(row.place, null);
    assert.equal(row.seed_time_cs, 14361); // 2:23.61
    assert.equal(row.code, 'LJST-NC'); // "Lake Jeanette Lightning-NC" -> alias.name match
  });

  test('relay psych-sheet legs are still parsed', () => {
    const legs = db.prepare(
      `SELECT l.leg_no, l.swimmer_name_raw name FROM relay_leg l
       JOIN relay rl ON rl.relay_id = l.relay_id
       JOIN result r ON r.relay_id = rl.relay_id
       JOIN event_round er ON er.round_id = rl.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 34 AND r.seed_time_cs = 14361 ORDER BY l.leg_no`,
    ).all();
    assert.equal(legs.length, 4);
    assert.equal(legs[0].name, 'Sagen, Tanner');
  });

  test('individual psych-sheet entrant resolves via existing truncated-code alias', () => {
    const row = db.prepare(
      `SELECT s.full_name name, r.place, r.seed_time_cs, t.code FROM result r
       JOIN swimmer s ON s.swimmer_id = r.swimmer_id
       JOIN team t ON t.team_id = s.team_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 124 AND s.last_name = 'Winegarner'`,
    ).get();
    assert.equal(row.place, null);
    assert.equal(row.seed_time_cs, 5037); // 50.37
    assert.equal(row.code, 'BUR-NC');
  });

  test('a psych sheet for an event that already has real results creates no extra round', () => {
    const ev = db.prepare("SELECT event_id FROM event WHERE event_number = 32 AND age_group_label = '8&U'").get();
    assert.ok(ev);
    const rounds = db.prepare('SELECT round_type FROM event_round WHERE event_id = ?').all(ev.event_id);
    assert.deepEqual(rounds.map((r) => r.round_type), ['FINAL'], 'no ENTRY round was added alongside the real FINAL');
  });

  test('a file with two embedded age-group blocks splits into two events', () => {
    const events = db.prepare(
      'SELECT event_id, age_group_label FROM event WHERE event_number = 109 ORDER BY age_group_label',
    ).all();
    assert.equal(events.length, 2, 'event 109 becomes two distinct events, not one merged event');
    assert.deepEqual(events.map((e) => e.age_group_label), ['13-14', '15-19']);
    assert.notEqual(events[0].event_id, events[1].event_id);
  });

  test('each age-group block scores its own place 1 (no false cross-block tie)', () => {
    const winner = (ageGroup) => db.prepare(
      `SELECT s.full_name name FROM result r
       JOIN swimmer s ON s.swimmer_id = r.swimmer_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 109 AND e.age_group_label = ? AND r.place = 1`,
    ).get(ageGroup);
    assert.equal(winner('13-14').name, 'Young, Ainsley');
    assert.equal(winner('15-19').name, 'Dugas, Shelby M');
  });

  test('a genuine same-block tie is still recorded as a tie', () => {
    const tied = db.prepare(
      `SELECT s.full_name name, r.time_cs FROM result r
       JOIN swimmer s ON s.swimmer_id = r.swimmer_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 109 AND e.age_group_label = '15-19' AND r.place = 26
       ORDER BY name`,
    ).all();
    assert.equal(tied.length, 2);
    assert.deepEqual(tied.map((t) => t.time_cs), [4296, 4296]);
  });

  test('a tie shares the place with both times recorded', () => {
    const tied = db.prepare(
      `SELECT s.full_name name, r.time_cs FROM result r
       JOIN swimmer s ON s.swimmer_id = r.swimmer_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 3 AND r.place = 5 ORDER BY name`,
    ).all();
    assert.equal(tied.length, 2);
    assert.deepEqual(tied.map((t) => t.time_cs), [3675, 3675]);
  });

  test('DQ keeps the time when shown and place is NULL', () => {
    const dq = db.prepare(
      `SELECT r.place, r.time_cs, r.time_code FROM result r
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 3 AND r.time_code = 'DQ' ORDER BY r.time_cs`,
    ).all();
    assert.ok(dq.length >= 1);
    for (const row of dq) assert.equal(row.place, null);
    assert.ok(dq.some((row) => row.time_cs === 4552), 'DQ 45.52 keeps its time');
  });

  test('winner of event 3 parses fully', () => {
    const w = db.prepare(
      `SELECT s.full_name name, t.code team, r.seed_time_cs seed, r.time_cs FROM result r
       JOIN swimmer s ON s.swimmer_id = r.swimmer_id
       JOIN team t ON t.team_id = s.team_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 3 AND r.place = 1`,
    ).get();
    assert.equal(w.name, 'Kirby, Ella');
    assert.equal(w.seed, 3390);
    assert.equal(w.time_cs, 3250);
  });

  test('relay entry has 4 legs in swim order and its splits', () => {
    const legs = db.prepare(
      `SELECT l.leg_no, l.swimmer_name_raw name FROM relay_leg l
       JOIN relay rl ON rl.relay_id = l.relay_id
       JOIN result r ON r.relay_id = rl.relay_id
       JOIN event_round er ON er.round_id = rl.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 32 AND r.place = 1 ORDER BY l.leg_no`,
    ).all();
    assert.deepEqual(legs.map((l) => l.leg_no), [1, 2, 3, 4]);
    assert.equal(legs[0].name, 'Quincy Lofton');

    const splits = db.prepare(
      `SELECT sp.split_no, sp.cumulative_time_cs cum, sp.interval_time_cs intv FROM split sp
       JOIN result r ON r.result_id = sp.result_id
       JOIN event_round er ON er.round_id = r.round_id
       JOIN event e ON e.event_id = er.event_id
       WHERE e.event_number = 32 AND r.place = 1 ORDER BY sp.split_no`,
    ).all();
    assert.deepEqual(splits.map((s) => s.cum), [4289, 7751]);
    assert.equal(splits[1].intv, 3462);
  });
});
