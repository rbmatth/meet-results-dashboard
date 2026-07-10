#!/usr/bin/env node
'use strict';

// Parse HY-TEK Meet Manager result pages (results/<MEET>/*.htm) into a normalized
// SQLite database defined by schema.sql.
//
// Usage:  node parse_meet.js <results/DIR> [db-path]
// Example: node parse_meet.js results/2025CSA meets.db
//
// Re-running is idempotent: the meet's existing rows are deleted (FK cascade) and
// reloaded, so multiple meets can share one database file.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

// "33.56" -> 3356 ; "1:03.48" -> 6348 ; "2:19.58" -> 13958. Returns null if not a time.
function timeToCs(str) {
  if (str == null) return null;
  const m = String(str).trim().match(/^(?:(\d+):)?(\d{1,2})\.(\d{2})$/);
  if (!m) return null;
  const min = m[1] ? parseInt(m[1], 10) : 0;
  const sec = parseInt(m[2], 10);
  const hh = parseInt(m[3], 10);
  return (min * 60 + sec) * 100 + hh;
}

// "7/10/2025" -> "2025-07-10"
function toIsoDate(mdy) {
  const m = mdy && mdy.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// "11:05 AM" -> "11:05" ; "6:07 PM" -> "18:07"
function to24hTime(t) {
  const m = t && t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// Normalize the two spellings the source uses ("8 & Under" in event titles,
// "8&U" in the index) to a canonical label like "8&U" / "15&O" / "9-10".
function normalizeAgeLabel(raw) {
  if (!raw) return null;
  return raw.trim()
    .replace(/\s*&\s*Under/i, '&U')
    .replace(/\s*&\s*Over/i, '&O')
    .replace(/\s+/g, '');
}

// "8&U" -> [null, 8] ; "13-19" -> [13, 19] ; "15&O" -> [15, null]
function parseAgeGroup(label) {
  const s = normalizeAgeLabel(label);
  if (!s) return [null, null];
  let m = s.match(/^(\d+)-(\d+)$/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  m = s.match(/^(\d+)&U$/i);
  if (m) return [null, parseInt(m[1], 10)];
  m = s.match(/^(\d+)&O$/i);
  if (m) return [parseInt(m[1], 10), null];
  return [null, null];
}

const STROKE_MAP = [
  [/individual medley|(^|\s)im(\s|$)/i, 'IM'],
  [/medley/i, 'MEDLEY'],
  [/back/i, 'BACK'],
  [/breast/i, 'BREAST'],
  [/butterfly|fly/i, 'FLY'],
  [/free/i, 'FREE'],
];
function normalizeStroke(text) {
  for (const [re, code] of STROKE_MAP) if (re.test(text)) return code;
  return null;
}

// Strip the zero-width <span></span> markers HY-TEK injects into data rows so the
// text re-aligns with the (span-free) column header.
function stripSpans(line) {
  return line.replace(/<span><\/span>/g, '');
}

// Extract the <pre>...</pre> body of a result page.
function preBody(html) {
  const m = html.match(/<pre>([\s\S]*?)<\/pre>/i);
  return m ? m[1] : '';
}

// Parse a trailing "time cells" string into ordered cells, each with a start index,
// a numeric value (cs) and/or a status code. Handles: "33.56", "J40.24",
// "DQ 48.60", "DQ", "NS", "SCR".
function parseTimeCells(tail) {
  const cells = [];
  const re = /(DQ|NS|SCR|DFS)\s+(\d+:\d{2}\.\d{2}|\d{1,2}\.\d{2})|(DQ|NS|SCR|DFS)|(J|x|q)?(\d+:\d{2}\.\d{2}|\d{1,2}\.\d{2})/g;
  let m;
  while ((m = re.exec(tail)) !== null) {
    if (m[0].trim() === '') { re.lastIndex++; continue; }
    let code = null, timeStr = null;
    if (m[1]) { code = m[1]; timeStr = m[2]; }        // "DQ 48.60"
    else if (m[3]) { code = m[3]; }                    // "DQ" alone
    else { code = m[4] || null; timeStr = m[5]; }      // "J40.24" / "33.02"
    cells.push({ index: m.index, code, timeStr, cs: timeToCs(timeStr) });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// evtindex.htm: meet metadata, sessions, and file -> session/round mapping
// ---------------------------------------------------------------------------

function parseIndex(dir) {
  const html = fs.readFileSync(path.join(dir, 'evtindex.htm'), 'utf8');
  const meet = { name: null, start_date: null, end_date: null, software: null };

  const nameM = html.match(/<h2[^>]*>(?:<font[^>]*>)?\s*([^<]+?)\s*</i);
  if (nameM) meet.name = nameM[1].trim();
  const rangeM = html.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (rangeM) { meet.start_date = toIsoDate(rangeM[1]); meet.end_date = toIsoDate(rangeM[2]); }
  const swM = html.match(/Created by\s+([^<]+)/i);
  if (swM) meet.software = swM[1].trim();

  // Split into session blocks on <hr />; a block is a session if it has an <h3>.
  const sessions = [];
  const fileMap = new Map(); // file -> { sessionLabel, eventNumber, desc, order }
  const blocks = html.split(/<hr\s*\/?>/i);
  let order = 0;
  for (const block of blocks) {
    const h3 = block.match(/<h3>\s*Session\s+(\S+)\s*-\s*([^<]+?)<br>\s*(\w+)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (!h3) continue;
    const label = h3[1];
    sessions.push({
      label,
      start_time: to24hTime(h3[2]),
      day_name: h3[3],
      session_date: toIsoDate(h3[4]),
      order_num: sessions.length,
    });
    const linkRe = /<a\s+href="([^"]+\.htm)"[^>]*>\s*#(\d+)\s*([^<]*?)\s*<\/a>/gi;
    let lm;
    while ((lm = linkRe.exec(block)) !== null) {
      fileMap.set(lm[1], { sessionLabel: label, eventNumber: parseInt(lm[2], 10), desc: lm[3], order: order++ });
    }
  }
  return { meet, sessions, fileMap };
}

// Parse the page header for facility/location/report timestamp. The <pre> block
// starts with a newline, so the header line is not necessarily lines[0]; scan for it.
function parseHeader(lines) {
  const out = { facility: null, location: null, report_at: null };
  const licLine = lines.find((l) => /Site License/i.test(l)) || '';
  const fm = licLine.match(/^\s*(.+?)\s*-\s*Site License\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (fm) {
    out.facility = fm[1].trim();
    const d = toIsoDate(fm[2]);
    const t = to24hTime(fm[3]);
    out.report_at = d && t ? `${d}T${t}` : d;
  } else {
    const f2 = licLine.match(/^\s*(.+?)\s*-\s*Site License/i);
    if (f2) out.facility = f2[1].trim();
  }
  // Location: the first centered non-empty line that isn't the license/meet/divider
  // line (in this data it repeats the facility name).
  for (const l of lines) {
    const s = l.trim();
    if (s && !/Site License|City Meet|Last Completed|Psych|Program|=|Event\s+\d+/i.test(s) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      out.location = s;
      break;
    }
  }
  return out;
}

// Parse the "Event N  <Gender> <ageGroup> <dist> Yard <stroke...> <division>" title.
function parseEventTitle(line) {
  const m = line.match(/Event\s+(\d+)\s+(Boys|Girls|Men|Women|Mixed)\s+(\d+\s*&\s*(?:Under|Over)|\d+&[UO]|\d+-\d+)\s+(\d+)\s+(Yard|Meter|SCM|LCM)\s+(.+?)\s*$/i);
  if (!m) return null;
  const genderWord = m[2].toLowerCase();
  const gender = /^(boys|men)$/.test(genderWord) ? 'M' : /^(girls|women)$/.test(genderWord) ? 'F' : 'X';
  const ageLabel = normalizeAgeLabel(m[3]);
  const [minAge, maxAge] = parseAgeGroup(m[3]);
  const rest = m[6].trim();                       // e.g. "Medley Relay Champ"
  const divMatch = rest.match(/(Champs?|Open)\s*$/i);
  const division = divMatch ? (/^champ/i.test(divMatch[1]) ? 'CHAMP' : 'OPEN') : null;
  const strokePart = divMatch ? rest.slice(0, divMatch.index).trim() : rest;
  return {
    event_number: parseInt(m[1], 10),
    gender,
    age_group_label: ageLabel,
    min_age: minAge,
    max_age: maxAge,
    distance: parseInt(m[4], 10),
    course: m[5][0].toUpperCase(),                // 'Y' / 'M'
    is_relay: /relay/i.test(strokePart) ? 1 : 0,
    stroke: normalizeStroke(strokePart),
    division,
    title: line.replace(/^\s*Event\s+/i, 'Event ').trim(),
  };
}

// Split "Last, First" or "First Last" into { last, first }. Relay legs appear in
// both formats; individual rows are always "Last, First".
function splitName(raw) {
  const s = raw.trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',');
    return { last: last.trim(), first: (first || '').trim(), full: s };
  }
  const parts = s.split(/\s+/);
  const last = parts.pop();
  return { last, first: parts.join(' '), full: s };
}

// Canonical team aliases. The 2026 results export truncated short-names (with spaces)
// instead of 2025's single-token codes; map them to a canonical code + full name so the
// same team is consistent across meets. Full names are from the 2026 psych sheets.
// Keys are the raw team strings as they appear in the results.
const TEAM_ALIASES = {
  'Friendly': { code: 'FR', name: 'Friendly Frogs' },
  'Hamilton Lakes-N': { code: 'HL-NC', name: 'Hamilton Lakes Hornets' },
  'BurMil-NC': { code: 'BUR-NC', name: 'Bur-Mil Marlins' },
  'Lightning-NC': { code: 'LJST-NC', name: 'Lake Jeanette Lightning' },
  'Sherwood-NC': { code: 'SW-NC', name: 'Sherwood Swim and Racquet' },
  'Cardinal-NC': { code: 'CAR-NC', name: 'Cardinal Swim Team' },
  'HP Elks-NC': { code: 'HPE-NC', name: 'High Point Elks' },
  'Starmount-NC': { code: 'SFCC-NC', name: 'Starmont Forest Country Club' },
  'Grandover-NC': { code: 'GSRC-NC', name: 'Grandover Swim & Racquet Club' },
  'Forest Oaks-NC': { code: 'FOCC-NC', name: 'Forest Oaks Country Club' },
  'Scc Fins-NC': { code: 'SCC-NC', name: 'SCC Fins' },
  'HF-NC': { code: 'HF-NC', name: 'Henson Forest' },
  'SESC-NC': { code: 'SESC-NC', name: 'Southeast Tigersharks' },
  'GVP-GN': { code: 'GVP-GN', name: 'Green Valley Park Gators' },
  'ORSC-NC': { code: 'ORSC-NC', name: 'Oak Ridge Swim Club' },
  'RWD-NC': { code: 'RWD-NC', name: 'RWD' },
  'PT': { code: 'PT', name: 'Pinetop Piranhas' },
  // Uncertain 2025 match — keep own code, use authoritative full name.
  'Gso Elks-NC': { code: 'GEL-NC', name: 'Greensboro Elks' },
  'Blue Dolphins-NC': { code: 'BD-NC', name: 'Blue Dolphins' },
};

// Resolve a raw team string to its alias. The source clips long team strings at
// varying column widths ("Hamilton Lakes-N" vs "Hamilton Lakes-NC"), so after an
// exact match, fall back to a prefix match in either direction. The minimum prefix
// length keeps short stable codes (PT, FR, HF-NC) on the exact-match path only.
const ALIAS_MIN_PREFIX = 8;
function resolveTeamAlias(raw) {
  const exact = TEAM_ALIASES[raw];
  if (exact) return exact;
  for (const [key, alias] of Object.entries(TEAM_ALIASES)) {
    const len = Math.min(key.length, raw.length);
    if (len >= ALIAS_MIN_PREFIX && (key.startsWith(raw) || raw.startsWith(key))) return alias;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Database access layer
// ---------------------------------------------------------------------------

class Store {
  constructor(db, meetId) {
    this.db = db;
    this.meetId = meetId;
    this.teamCache = new Map();
    this.swimmerCache = new Map();
    this.ps = {
      team: db.prepare(`INSERT INTO team(code, lsc, name) VALUES (?, ?, ?)
                        ON CONFLICT(code) DO UPDATE SET name = COALESCE(excluded.name, name)`),
      teamGet: db.prepare('SELECT team_id FROM team WHERE code = ?'),
      swimmer: db.prepare(`INSERT OR IGNORE INTO swimmer(meet_id, team_id, last_name, first_name, full_name, gender, age)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`),
      swimmerGet: db.prepare(`SELECT swimmer_id FROM swimmer
                              WHERE meet_id = ? AND team_id IS ? AND last_name IS ? AND first_name IS ?`),
      event: db.prepare(`INSERT INTO event(meet_id, event_number, gender, age_group_label, min_age, max_age,
                           distance, stroke, course, is_relay, division, title)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      round: db.prepare(`INSERT INTO event_round(event_id, session_id, round_type, source_file, report_generated_at)
                         VALUES (?, ?, ?, ?, ?)`),
      relay: db.prepare('INSERT INTO relay(round_id, team_id, relay_letter) VALUES (?, ?, ?)'),
      result: db.prepare(`INSERT INTO result(round_id, swimmer_id, relay_id, place, heat_group,
                            seed_time_cs, seed_time_raw, time_cs, time_raw, time_code)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      leg: db.prepare(`INSERT INTO relay_leg(relay_id, leg_no, swimmer_id, swimmer_name_raw, age)
                       VALUES (?, ?, ?, ?, ?)`),
      split: db.prepare(`INSERT INTO split(result_id, split_no, distance, cumulative_time_cs, interval_time_cs)
                         VALUES (?, ?, ?, ?, ?)`),
    };
  }

  teamId(rawCode) {
    const raw = rawCode.trim();
    const alias = resolveTeamAlias(raw);
    const code = alias ? alias.code : raw;
    const name = alias ? alias.name : null;
    if (this.teamCache.has(code)) return this.teamCache.get(code);
    const parts = code.split('-');
    const lsc = parts.length > 1 && /^[A-Z]{2}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : null;
    this.ps.team.run(code, lsc, name);
    const id = this.ps.teamGet.get(code).team_id;
    this.teamCache.set(code, id);
    return id;
  }

  swimmerId(rawName, teamCode, gender, age) {
    const teamId = teamCode ? this.teamId(teamCode) : null;
    const { last, first } = splitName(rawName);
    const key = `${teamId}|${last}|${first}`;
    if (this.swimmerCache.has(key)) return this.swimmerCache.get(key);
    // Canonicalize display name to "Last, First" so relay-leg entries (which appear
    // as "First Last" in the source) and individual entries render consistently.
    const full = first ? `${last}, ${first}` : last;
    this.ps.swimmer.run(this.meetId, teamId, last, first, full, gender || null, age ?? null);
    const row = this.ps.swimmerGet.get(this.meetId, teamId, last, first);
    const id = row.swimmer_id;
    this.swimmerCache.set(key, id);
    return id;
  }
}

// ---------------------------------------------------------------------------
// Event-file parsing
// ---------------------------------------------------------------------------

function roundTypeFor(fileName, division) {
  if (/[/]?\d{6}P\d{3}\.htm$/i.test(fileName)) return 'PRELIM';
  // F-file: championship final for Champ events, timed final for Open/relay-open.
  return division === 'OPEN' ? 'TIMED_FINAL' : 'FINAL';
}

function parseEventFile(dir, fileName, ctx, store) {
  const html = fs.readFileSync(path.join(dir, fileName), 'utf8');
  const raw = preBody(html);

  // Skip non-results pages a mid-meet scrape may contain: pre-meet Psych Sheets /
  // Meet Programs (no places/finals/splits) and "not available" placeholders for
  // events that haven't been swum. The results schema doesn't model these.
  if (/Psych Sheet|Meet Program/i.test(raw)) return 'skipped-psych';
  if (/not available/i.test(raw)) return 'skipped-empty';

  const lines = raw.split('\n');
  const header = parseHeader(lines);

  const titleLine = lines.find((l) => /<b>\s*Event\s+\d+/i.test(l) || /^\s*Event\s+\d+/.test(stripSpans(l).replace(/<\/?b>/g, '')));
  if (!titleLine) return 'skipped-notitle';
  const ev = parseEventTitle(stripSpans(titleLine).replace(/<\/?b>/g, ''));
  if (!ev) return 'skipped-notitle';

  const mapping = ctx.fileMap.get(fileName) || {};
  const sessionId = mapping.sessionLabel ? ctx.sessionIdByLabel.get(mapping.sessionLabel) : null;
  const roundType = roundTypeFor(fileName, ev.division);

  // Upsert the event (shared by prelim + final rounds).
  let eventId = ctx.eventIdByNumber.get(ev.event_number);
  if (!eventId) {
    eventId = store.ps.event.run(store.meetId, ev.event_number, ev.gender, ev.age_group_label,
      ev.min_age, ev.max_age, ev.distance, ev.stroke, ev.course, ev.is_relay, ev.division, ev.title).lastInsertRowid;
    ctx.eventIdByNumber.set(ev.event_number, eventId);
  }
  const roundId = store.ps.round.run(eventId, sessionId ?? null, roundType, fileName, header.report_at).lastInsertRowid;

  const nSplitsExpected = ev.is_relay ? 4 : 0; // relays here split every leg
  let heatGroup = null;
  let curRelay = null; // { relayId, resultId, legs, splits }

  const flushRelaySplits = () => {
    if (!curRelay || curRelay.splits.length === 0) return;
    curRelay.splits.forEach((sp, i) => {
      const splitNo = i + 1;
      const dist = nSplitsExpected ? Math.round((ev.distance * splitNo) / nSplitsExpected) : null;
      store.ps.split.run(curRelay.resultId, splitNo, dist, sp.cumCs, sp.intCs);
    });
    curRelay.splits = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const clean = stripSpans(lines[i]).replace(/<\/?b>/g, '');
    if (!clean.trim()) continue;

    const section = clean.match(/===\s*([A-Z])\s*-\s*Final\s*===/i);
    if (section) { flushRelaySplits(); curRelay = null; heatGroup = section[1].toUpperCase(); continue; }
    if (/===\s*(Preliminaries|Swim-?off|Final)\s*===/i.test(clean)) { flushRelaySplits(); curRelay = null; heatGroup = null; continue; }
    if (/^\s*Event\s+\d+/.test(clean) || /^=+$/.test(clean.trim()) || /Name\s+Age\s+Team|^\s*Team\s+/.test(clean)) continue;

    if (ev.is_relay) {
      // Relay team row: "  1 ORSC-NC  'A'   <seed>  <final>". Team is matched
      // lazily (anchored on the 'X' letter) to tolerate spaces in team names.
      const rel = clean.match(/^\s*(\d+|--)\s+(.+?)\s+'([A-Z0-9])'\s*(.*)$/);
      if (rel) {
        flushRelaySplits();
        const place = rel[1] === '--' ? null : parseInt(rel[1], 10);
        const teamId = store.teamId(rel[2].trim());
        const relayId = store.ps.relay.run(roundId, teamId, rel[3]).lastInsertRowid;
        const cells = parseTimeCells(rel[4]);
        const seed = cells[0] || {};
        const swum = cells[1] || {};
        const resultId = store.ps.result.run(roundId, null, relayId, place, heatGroup,
          seed.cs ?? null, seed.timeStr ?? null, swum.cs ?? null, swum.timeStr ?? (swum.code || null), swum.code ?? null).lastInsertRowid;
        curRelay = { relayId, resultId };
        curRelay.splits = [];
        continue;
      }
      // Relay leg line(s): "1) Carson Turner 10   2) Hadley Brinker 10".
      // Require whitespace before the leg number and a letter after ")" so that
      // interval times like "(38.43)" are not mistaken for a leg marker.
      if (curRelay && /(^|\s)[1-4]\)\s+[A-Za-z]/.test(clean)) {
        const legRe = /(?:^|\s)([1-4])\)\s+(.+?)\s+(\d{1,2})(?=\s{2,}|\s*$)/g;
        let lm;
        while ((lm = legRe.exec(clean)) !== null) {
          const legNo = parseInt(lm[1], 10);
          const age = parseInt(lm[3], 10);
          const teamCode = relTeamCode(curRelay, store);
          const swimmerId = store.swimmerId(lm[2], teamCode, ev.gender, age);
          store.ps.leg.run(curRelay.relayId, legNo, swimmerId, lm[2].trim(), age);
        }
        continue;
      }
      // Relay split line: cumulative times with optional "(interval)"
      if (curRelay && /\d\.\d{2}/.test(clean)) {
        const splitRe = /(?:DQ\s+)?(\d+:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*(?:\(([^)]*)\))?/g;
        let sm;
        while ((sm = splitRe.exec(clean)) !== null) {
          if (!sm[1]) { splitRe.lastIndex++; continue; }
          curRelay.splits.push({ cumCs: timeToCs(sm[1]), intCs: timeToCs((sm[2] || '').trim()) });
        }
        continue;
      }
    } else {
      // Individual result row: "  1 Xie, George   10 BUR-NC   <seed>  <time>".
      // Team names may contain spaces (e.g. "Hamilton Lakes-N"), so parse right-anchored:
      // find the time cells, then read name/age/team from the text before them.
      const lead = clean.match(/^\s*(\d+|--)\s+(.*)$/);
      if (!lead) continue;
      const rest = lead[2];
      const cells = parseTimeCells(rest);
      const firstIdx = cells.length ? cells[0].index : rest.length;
      const info = rest.slice(0, firstIdx).match(/^(.+?)\s+(\d{1,2})\s+(.+?)\s*$/);
      if (!info) continue;
      const place = lead[1] === '--' ? null : parseInt(lead[1], 10);
      const name = info[1].trim();
      const age = parseInt(info[2], 10);
      const teamCode = info[3].trim();
      const seed = cells[0] || {};
      const swum = cells[1] || {};
      // In a FINAL file, non-qualifiers (the trailing prelim section) have no swum
      // time -> that swimmer already has a PRELIM result, so skip creating one here.
      if (roundType !== 'PRELIM' && !swum.timeStr && !swum.code) continue;
      const swimmerId = store.swimmerId(name, teamCode, ev.gender, age);
      store.ps.result.run(roundId, swimmerId, null, place, heatGroup,
        seed.cs ?? null, seed.timeStr ?? null, swum.cs ?? null, swum.timeStr ?? (swum.code || null), swum.code ?? null);
    }
  }
  flushRelaySplits();
  return 'parsed';
}

// Look up the team code for a relay via its stored team_id (cached reverse map).
function relTeamCode(curRelay, store) {
  if (curRelay._teamCode) return curRelay._teamCode;
  const row = store.db.prepare('SELECT t.code FROM relay r JOIN team t ON t.team_id = r.team_id WHERE r.relay_id = ?').get(curRelay.relayId);
  curRelay._teamCode = row ? row.code : null;
  return curRelay._teamCode;
}

// Warn about probable same-club duplicates among this meet's teams: pairs where one
// code is a prefix of the other (a truncation-width variant missing from TEAM_ALIASES).
function warnLikelyDuplicateTeams(db, meetId) {
  const teams = db.prepare(
    `SELECT DISTINCT t.team_id, t.code FROM team t
     WHERE t.team_id IN (SELECT team_id FROM swimmer WHERE meet_id = ?)
        OR t.team_id IN (SELECT rl.team_id FROM relay rl
                         JOIN event_round er ON er.round_id = rl.round_id
                         JOIN event e ON e.event_id = er.event_id WHERE e.meet_id = ?)`,
  ).all(meetId, meetId);
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const [a, b] = [teams[i].code, teams[j].code];
      const len = Math.min(a.length, b.length);
      if (len >= ALIAS_MIN_PREFIX && (a.startsWith(b) || b.startsWith(a))) {
        console.warn(`  ! likely duplicate teams: "${a}" and "${b}" — add a TEAM_ALIASES entry?`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const dir = process.argv[2];
  const dbPath = process.argv[3] || 'meets.db';
  if (!dir) {
    console.error('Usage: node parse_meet.js <results/DIR> [db-path]');
    process.exit(1);
  }
  const code = path.basename(dir.replace(/[/\\]+$/, ''));

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  // Idempotent reload: drop this meet's data (cascades) then recreate it.
  db.prepare('DELETE FROM meet WHERE code = ?').run(code);

  const { meet, sessions, fileMap } = parseIndex(dir);
  const header0 = (() => {
    const anyEvent = fs.readdirSync(dir).find((f) => /^\d{6}[PF]\d{3}\.htm$/i.test(f));
    if (!anyEvent) return {};
    return parseHeader(preBody(fs.readFileSync(path.join(dir, anyEvent), 'utf8')).split('\n'));
  })();

  const meetId = db.prepare(`INSERT INTO meet(code, name, facility, location, start_date, end_date, course, software)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, meet.name, header0.facility, header0.location, meet.start_date, meet.end_date, 'Y', meet.software).lastInsertRowid;

  const sessionIdByLabel = new Map();
  const insSession = db.prepare(`INSERT INTO session(meet_id, label, session_date, start_time, day_name, order_num)
                                 VALUES (?, ?, ?, ?, ?, ?)`);
  for (const s of sessions) {
    const id = insSession.run(meetId, s.label, s.session_date, s.start_time, s.day_name, s.order_num).lastInsertRowid;
    sessionIdByLabel.set(s.label, id);
  }

  const ctx = { fileMap, sessionIdByLabel, eventIdByNumber: new Map() };
  const store = new Store(db, meetId);

  // Parse prelims before finals so the shared event row is created by the prelim pass
  // and both rounds attach to it.
  const files = fs.readdirSync(dir).filter((f) => /^\d{6}[PF]\d{3}\.htm$/i.test(f));
  files.sort((a, b) => {
    const na = parseInt(a.match(/[PF](\d{3})/i)[1], 10);
    const nb = parseInt(b.match(/[PF](\d{3})/i)[1], 10);
    const pa = /P/i.test(a) ? 0 : 1;
    const pb = /P/i.test(b) ? 0 : 1;
    return na - nb || pa - pb;
  });

  db.exec('BEGIN');
  const tally = { parsed: 0, skipped: 0 };
  for (const f of files) {
    try {
      const status = parseEventFile(dir, f, ctx, store);
      if (status === 'parsed') tally.parsed++; else tally.skipped++;
    } catch (e) {
      console.error(`  ! ${f}: ${e.message}`);
    }
  }
  db.exec('COMMIT');

  if (tally.parsed === 0) {
    db.prepare('DELETE FROM meet WHERE code = ?').run(code);
    console.error(`No results pages found in ${dir} (skipped ${tally.skipped} psych/empty files). Nothing loaded.`);
    db.close();
    process.exit(2);
  }

  const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`Loaded meet "${meet.name}" (${code}) into ${dbPath}`);
  console.log(`  files: ${tally.parsed} results parsed, ${tally.skipped} skipped (psych/empty/other)`);
  for (const t of ['session', 'team', 'swimmer', 'event', 'event_round', 'result', 'relay', 'relay_leg', 'split']) {
    console.log(`  ${t.padEnd(12)} ${count(t)}`);
  }
  warnLikelyDuplicateTeams(db, meetId);
  db.close();
}

main();
