-- Normalized relational schema for HY-TEK Meet Manager swim-meet results.
-- Target engine: SQLite. Times are stored as centiseconds (INTEGER) for correct
-- sorting/comparison, with the original display string kept alongside (*_raw).
-- Enable foreign keys per-connection with: PRAGMA foreign_keys = ON;

PRAGMA foreign_keys = ON;

-- A single meet (one scraped results directory, e.g. "2025CSA").
CREATE TABLE IF NOT EXISTS meet (
  meet_id    INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,      -- directory name, e.g. "2025CSA"
  name       TEXT,                      -- "2025 CSA City Meet"
  facility   TEXT,                      -- "Greensboro Aquatic Center"
  location   TEXT,
  start_date TEXT,                      -- ISO YYYY-MM-DD
  end_date   TEXT,                      -- ISO YYYY-MM-DD
  course     TEXT,                      -- 'Y' (yards) / 'S' (SCM) / 'L' (LCM)
  software   TEXT                       -- "HY-TEK's MM 8.0Fe"
);

-- A timed session within a meet (from evtindex.htm), e.g. "1A", "2".
CREATE TABLE IF NOT EXISTS session (
  session_id   INTEGER PRIMARY KEY,
  meet_id      INTEGER NOT NULL REFERENCES meet(meet_id) ON DELETE CASCADE,
  label        TEXT NOT NULL,           -- "1A"
  session_date TEXT,                    -- ISO YYYY-MM-DD
  start_time   TEXT,                    -- "08:15"
  day_name     TEXT,                    -- "Thursday"
  order_num    INTEGER,                 -- appearance order in the index
  UNIQUE (meet_id, label)
);

-- A team / club. Identified by its HY-TEK code (globally stable across meets).
CREATE TABLE IF NOT EXISTS team (
  team_id INTEGER PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,         -- "BUR-NC"
  lsc     TEXT,                         -- parsed suffix "NC" (best-effort, nullable)
  name    TEXT                          -- full name (absent in source, nullable)
);

-- A swimmer. No source ID exists, so identity is (meet, team, last, first).
-- Scoped per-meet because age changes between meets and names aren't globally unique.
CREATE TABLE IF NOT EXISTS swimmer (
  swimmer_id INTEGER PRIMARY KEY,
  meet_id    INTEGER NOT NULL REFERENCES meet(meet_id) ON DELETE CASCADE,
  team_id    INTEGER REFERENCES team(team_id),
  last_name  TEXT,
  first_name TEXT,
  full_name  TEXT,
  gender     TEXT,                      -- 'M' / 'F' (inferred from the event)
  age        INTEGER,
  UNIQUE (meet_id, team_id, last_name, first_name)
);

-- A logical event. Champ prelims and finals share one event row (same number).
CREATE TABLE IF NOT EXISTS event (
  event_id        INTEGER PRIMARY KEY,
  meet_id         INTEGER NOT NULL REFERENCES meet(meet_id) ON DELETE CASCADE,
  event_number    INTEGER NOT NULL,
  gender          TEXT,                 -- 'M' / 'F' / 'X'
  age_group_label TEXT,                 -- "9-10", "8&U"
  min_age         INTEGER,              -- NULL for open-ended ("8&U" -> NULL)
  max_age         INTEGER,              -- NULL for open-ended ("15&O" -> NULL)
  distance        INTEGER,              -- total distance in the course unit
  stroke          TEXT,                 -- BACK/FREE/BREAST/FLY/IM/MEDLEY
  course          TEXT,                 -- 'Y'
  is_relay        INTEGER NOT NULL DEFAULT 0 CHECK (is_relay IN (0, 1)),
  division        TEXT,                 -- 'CHAMP' / 'OPEN'
  title           TEXT,                 -- raw title line
  UNIQUE (meet_id, event_number)
);

-- A round of an event: prelims, finals, or a single timed final (Open/relay).
-- The session that runs this round links here (prelims and finals differ).
CREATE TABLE IF NOT EXISTS event_round (
  round_id             INTEGER PRIMARY KEY,
  event_id             INTEGER NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
  session_id           INTEGER REFERENCES session(session_id) ON DELETE SET NULL,
  round_type           TEXT NOT NULL CHECK (round_type IN ('PRELIM', 'FINAL', 'TIMED_FINAL')),
  source_file          TEXT,            -- "250710F004.htm"
  report_generated_at  TEXT,            -- ISO datetime from the page header
  UNIQUE (event_id, round_type)
);

-- A relay-team entry (team + letter) within a round; parent of legs and splits.
CREATE TABLE IF NOT EXISTS relay (
  relay_id     INTEGER PRIMARY KEY,
  round_id     INTEGER NOT NULL REFERENCES event_round(round_id) ON DELETE CASCADE,
  team_id      INTEGER REFERENCES team(team_id),
  relay_letter TEXT,                    -- "A" / "B" / "C"
  UNIQUE (round_id, team_id, relay_letter)
);

-- One performance in a round: exactly one of swimmer_id / relay_id is set.
CREATE TABLE IF NOT EXISTS result (
  result_id     INTEGER PRIMARY KEY,
  round_id      INTEGER NOT NULL REFERENCES event_round(round_id) ON DELETE CASCADE,
  swimmer_id    INTEGER REFERENCES swimmer(swimmer_id) ON DELETE CASCADE,
  relay_id      INTEGER REFERENCES relay(relay_id) ON DELETE CASCADE,
  place         INTEGER,                -- NULL for DQ/NS
  heat_group    TEXT,                   -- 'A'/'B'/'C' final sub-group, else NULL
  seed_time_cs  INTEGER,                -- seed / preceding-round time as displayed
  seed_time_raw TEXT,
  time_cs       INTEGER,                -- time swum in THIS round
  time_raw      TEXT,
  time_code     TEXT,                   -- 'DQ'/'NS'/'J'/'SCR', else NULL
  CHECK ((swimmer_id IS NOT NULL) <> (relay_id IS NOT NULL))
);

-- The four legs of a relay entry, in swim order.
CREATE TABLE IF NOT EXISTS relay_leg (
  relay_leg_id     INTEGER PRIMARY KEY,
  relay_id         INTEGER NOT NULL REFERENCES relay(relay_id) ON DELETE CASCADE,
  leg_no           INTEGER NOT NULL,    -- 1..4
  swimmer_id       INTEGER REFERENCES swimmer(swimmer_id) ON DELETE SET NULL,
  swimmer_name_raw TEXT,
  age              INTEGER,
  UNIQUE (relay_id, leg_no)
);

-- Cumulative + interval splits for a result (relays here; individuals if present).
CREATE TABLE IF NOT EXISTS split (
  split_id           INTEGER PRIMARY KEY,
  result_id          INTEGER NOT NULL REFERENCES result(result_id) ON DELETE CASCADE,
  split_no           INTEGER NOT NULL,  -- 1..n
  distance           INTEGER,           -- cumulative distance (best-effort)
  cumulative_time_cs INTEGER,
  interval_time_cs   INTEGER,           -- the parenthetical delta, nullable
  UNIQUE (result_id, split_no)
);

CREATE INDEX IF NOT EXISTS idx_session_meet   ON session(meet_id);
CREATE INDEX IF NOT EXISTS idx_swimmer_meet   ON swimmer(meet_id);
CREATE INDEX IF NOT EXISTS idx_swimmer_team   ON swimmer(team_id);
CREATE INDEX IF NOT EXISTS idx_event_meet     ON event(meet_id);
CREATE INDEX IF NOT EXISTS idx_round_event    ON event_round(event_id);
CREATE INDEX IF NOT EXISTS idx_round_session  ON event_round(session_id);
CREATE INDEX IF NOT EXISTS idx_relay_round    ON relay(round_id);
CREATE INDEX IF NOT EXISTS idx_result_round   ON result(round_id);
CREATE INDEX IF NOT EXISTS idx_result_swimmer ON result(swimmer_id);
CREATE INDEX IF NOT EXISTS idx_result_relay   ON result(relay_id);
CREATE INDEX IF NOT EXISTS idx_leg_relay      ON relay_leg(relay_id);
CREATE INDEX IF NOT EXISTS idx_leg_swimmer    ON relay_leg(swimmer_id);
CREATE INDEX IF NOT EXISTS idx_split_result   ON split(result_id);
