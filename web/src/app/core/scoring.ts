// Meet scoring engine (pure functions). Champ and Open are scored independently with
// their own point tables. Relay results earn 2x the individual place value.
//
// Point tables are indexed by place (place 1 = index 0). Places beyond a table's length
// score 0. Ties split the summed points across the tied place range equally.

import { Division, EventInfo, Gender, MeetData, Result, RoundType } from './models';

export const CHAMP_INDIVIDUAL_POINTS = [
  32, 28, 27, 26, 25, 24, 23, 22, 20, 17, 16, 15, 14, 13, 12, 11, 9, 7, 6, 5, 4, 3, 2, 1,
];
export const OPEN_INDIVIDUAL_POINTS = [11, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const RELAY_MULTIPLIER = 2;

export function pointsTable(division: Division): number[] {
  return division === 'CHAMP' ? CHAMP_INDIVIDUAL_POINTS : OPEN_INDIVIDUAL_POINTS;
}

export function decidingRound(division: Division): RoundType {
  return division === 'CHAMP' ? 'FINAL' : 'TIMED_FINAL';
}

function pointsAtPlace(table: number[], place: number): number {
  return place >= 1 && place <= table.length ? table[place - 1] : 0;
}

// Points for a result at `place`, where `tieCount` entries share that place. The tied
// entries occupy places [place, place+tieCount-1] and split the summed points equally.
export function pointsForPlace(
  division: Division,
  place: number,
  tieCount: number,
  isRelay: boolean,
): number {
  const table = pointsTable(division);
  let sum = 0;
  for (let k = 0; k < tieCount; k++) sum += pointsAtPlace(table, place + k);
  const each = sum / tieCount;
  return isRelay ? each * RELAY_MULTIPLIER : each;
}

// ---------------------------------------------------------------------------
// Aggregated score book consumed by the UI
// ---------------------------------------------------------------------------

export interface DivisionPoints {
  champ: number;
  open: number;
}

export interface TeamScore extends DivisionPoints {
  teamId: number;
}

export interface GroupScore extends DivisionPoints {
  teamId: number;
  gender: Gender;
  ageGroup: string;
}

export interface SwimmerScore extends DivisionPoints {
  swimmerId: number;
  teamId: number;
}

export interface TeamPredictedActual {
  teamId: number;
  actual: DivisionPoints;
  predicted: DivisionPoints;
  deltaChamp: number; // actual.champ - predicted.champ
  deltaOpen: number; // actual.open - predicted.open
}

export interface Improvement {
  swimmerId: number;
  teamId: number | null;
  eventId: number;
  seedCs: number;
  timeCs: number;
  dropCs: number; // seed - achieved (positive = faster than seed)
}

export interface ScoreBook {
  teams: TeamScore[];
  // Seed-based prediction across ALL events (the "original" full-meet prediction).
  teamsPredicted: TeamScore[];
  // Seed-based prediction restricted to events that HAVE been completed — a like-for-like
  // seed baseline for the same events `teams` (actual) covers, so the two are comparable.
  teamsPredictedThroughCompleted: TeamScore[];
  // Actual points for completed events + projected points for the rest: the projected
  // final standings that account for results already in. Unlike the pure-seed columns,
  // the "rest" is ranked by prelim swum times where available (a better predictor once
  // prelims are in), falling back to seed times for genuinely unswum events.
  teamsProjectedFinal: TeamScore[];
  groups: GroupScore[];
  swimmers: SwimmerScore[];
  swimmersPredicted: SwimmerScore[];
  predictedVsActual: TeamPredictedActual[];
  improvements: Improvement[];
  // Awarded points per deciding-round result id (for per-event drill-down / display).
  pointsByResultId: Map<number, number>;
}

const emptyDiv = (): DivisionPoints => ({ champ: 0, open: 0 });

function addPoints(target: DivisionPoints, division: Division, pts: number): void {
  if (division === 'CHAMP') target.champ += pts;
  else target.open += pts;
}

function groupByEvent(results: Result[]): Map<number, Result[]> {
  const m = new Map<number, Result[]>();
  for (const r of results) {
    let arr = m.get(r.event_id);
    if (!arr) m.set(r.event_id, (arr = []));
    arr.push(r);
  }
  return m;
}

// The round whose seed times represent every entrant (for seed-based prediction):
// Champ individual -> PRELIM; Champ relay (no prelim) -> FINAL; Open -> TIMED_FINAL.
// Falls back to an ENTRY round (psych-sheet entrants) when the event hasn't been
// swum yet at all, so "predicted" includes not-yet-completed events too. Real rounds
// are always preferred when present — ENTRY only exists on an event when no real
// round was parsed for it (see parse_meet.js's parsePsychSheet).
function entryRoundResults(eventResults: Result[], division: Division): Result[] {
  const real =
    division === 'OPEN'
      ? eventResults.filter((r) => r.round_type === 'TIMED_FINAL')
      : (() => {
          const prelim = eventResults.filter((r) => r.round_type === 'PRELIM');
          return prelim.length ? prelim : eventResults.filter((r) => r.round_type === 'FINAL');
        })();
  return real.length ? real : eventResults.filter((r) => r.round_type === 'ENTRY');
}

export function computeScoreBook(data: MeetData): ScoreBook {
  const eventById = new Map<number, EventInfo>(data.events.map((e) => [e.id, e]));
  const resultsByEvent = groupByEvent(data.results);

  const teamActual = new Map<number, DivisionPoints>();
  const teamPredicted = new Map<number, DivisionPoints>();
  const teamPredictedCompleted = new Map<number, DivisionPoints>();
  const teamProjectedRemaining = new Map<number, DivisionPoints>();
  const groupActual = new Map<string, GroupScore>();
  const swimmerActual = new Map<number, SwimmerScore>();
  const swimmerPredicted = new Map<number, SwimmerScore>();
  const pointsByResultId = new Map<number, number>();
  const improvements: Improvement[] = [];

  const ensureTeam = (map: Map<number, DivisionPoints>, id: number) => {
    let v = map.get(id);
    if (!v) map.set(id, (v = emptyDiv()));
    return v;
  };
  const ensureGroup = (ev: EventInfo, teamId: number) => {
    const key = `${teamId}|${ev.gender}|${ev.age_group}`;
    let v = groupActual.get(key);
    if (!v) groupActual.set(key, (v = { teamId, gender: ev.gender, ageGroup: ev.age_group, ...emptyDiv() }));
    return v;
  };
  const ensureSwimmer = (map: Map<number, SwimmerScore>, swimmerId: number, teamId: number) => {
    let v = map.get(swimmerId);
    if (!v) map.set(swimmerId, (v = { swimmerId, teamId, ...emptyDiv() }));
    return v;
  };

  for (const [eventId, eventResults] of resultsByEvent) {
    const ev = eventById.get(eventId);
    if (!ev) continue;
    const division = ev.division;
    const isRelay = ev.is_relay === 1;

    // ----- Actual: award points off the deciding round, honoring ties -----
    const deciding = eventResults.filter(
      (r) => r.round_type === decidingRound(division) && r.place != null,
    );
    // An event counts as "completed" once it has any placed deciding-round result
    // (same notion the standings' scored/total banner uses).
    const isCompleted = deciding.length > 0;
    const tieCounts = new Map<number, number>();
    for (const r of deciding) tieCounts.set(r.place!, (tieCounts.get(r.place!) ?? 0) + 1);
    for (const r of deciding) {
      const pts = pointsForPlace(division, r.place!, tieCounts.get(r.place!)!, isRelay);
      if (pts === 0) continue;
      pointsByResultId.set(r.id, pts);
      if (r.team_id != null) {
        addPoints(ensureTeam(teamActual, r.team_id), division, pts);
        addPoints(ensureGroup(ev, r.team_id), division, pts);
      }
      if (!isRelay && r.swimmer_id != null && r.team_id != null) {
        addPoints(ensureSwimmer(swimmerActual, r.swimmer_id, r.team_id), division, pts);
      }
    }

    // ----- Predicted: rank entrants, award as if that order held -----
    const entrants = entryRoundResults(eventResults, division).filter(
      (r) => r.seed_cs != null && r.team_id != null,
    );
    // Seed-based prediction (pure pre-meet seeds): the "original" full-meet prediction
    // and its completed-events subset. Always ranked by seed time.
    [...entrants]
      .sort((a, b) => a.seed_cs! - b.seed_cs!)
      .forEach((r, i) => {
        const pts = pointsForPlace(division, i + 1, 1, isRelay);
        if (pts === 0) return;
        addPoints(ensureTeam(teamPredicted, r.team_id!), division, pts);
        if (isCompleted) addPoints(ensureTeam(teamPredictedCompleted, r.team_id!), division, pts);
        if (!isRelay && r.swimmer_id != null) {
          addPoints(ensureSwimmer(swimmerPredicted, r.swimmer_id, r.team_id!), division, pts);
        }
      });
    // Forward projection for events NOT yet finaled: rank by best available time —
    // the prelim swum time when present (a far better predictor than an old seed once
    // prelims are in), else the seed. Completed events contribute their actual points.
    if (!isCompleted) {
      [...entrants]
        .sort((a, b) => projectionTimeCs(a) - projectionTimeCs(b))
        .forEach((r, i) => {
          const pts = pointsForPlace(division, i + 1, 1, isRelay);
          if (pts === 0) return;
          addPoints(ensureTeam(teamProjectedRemaining, r.team_id!), division, pts);
        });
    }

    // ----- Improvement: achieved time vs entry seed, per individual entrant -----
    if (!isRelay) {
      const entry = entryRoundResults(eventResults, division);
      const seedBySwimmer = new Map<number, number>();
      for (const r of entry) if (r.swimmer_id != null && r.seed_cs != null) seedBySwimmer.set(r.swimmer_id, r.seed_cs);
      // Best achieved time = deciding-round time if present, else the entry-round time.
      const achieved = new Map<number, { timeCs: number; teamId: number | null }>();
      const consider = [...eventResults].sort((a, b) => roundRank(a.round_type) - roundRank(b.round_type));
      for (const r of consider) {
        if (r.swimmer_id == null || r.time_cs == null || r.time_code) continue;
        achieved.set(r.swimmer_id, { timeCs: r.time_cs, teamId: r.team_id });
      }
      for (const [swimmerId, seedCs] of seedBySwimmer) {
        const a = achieved.get(swimmerId);
        if (!a) continue;
        improvements.push({ swimmerId, teamId: a.teamId, eventId, seedCs, timeCs: a.timeCs, dropCs: seedCs - a.timeCs });
      }
    }
  }

  // Championship is the primary competition, so default ordering is by champ points.
  // Views re-sort per the active division as needed.
  const toTeamScores = (map: Map<number, DivisionPoints>): TeamScore[] =>
    [...map.entries()]
      .map(([teamId, p]) => ({ teamId, ...p }))
      .sort((a, b) => b.champ - a.champ);

  const teams = toTeamScores(teamActual);
  const teamsPredicted = toTeamScores(teamPredicted);
  const teamsPredictedThroughCompleted = toTeamScores(teamPredictedCompleted);

  // Projected final = actual points for completed events + the prelim-informed
  // projection for events still to come (teamProjectedRemaining only accumulated the
  // not-yet-completed ones).
  const projectedFinal = new Map<number, DivisionPoints>();
  for (const id of new Set([...teamActual.keys(), ...teamProjectedRemaining.keys()])) {
    const actual = teamActual.get(id) ?? emptyDiv();
    const remaining = teamProjectedRemaining.get(id) ?? emptyDiv();
    projectedFinal.set(id, {
      champ: actual.champ + remaining.champ,
      open: actual.open + remaining.open,
    });
  }
  const teamsProjectedFinal = toTeamScores(projectedFinal);

  const predictedVsActual: TeamPredictedActual[] = data.teams
    .map((t) => {
      const actual = teamActual.get(t.id) ?? emptyDiv();
      const predicted = teamPredicted.get(t.id) ?? emptyDiv();
      return {
        teamId: t.id,
        actual,
        predicted,
        deltaChamp: actual.champ - predicted.champ,
        deltaOpen: actual.open - predicted.open,
      };
    })
    .sort((a, b) => b.actual.champ - a.actual.champ);

  return {
    teams,
    teamsPredicted,
    teamsPredictedThroughCompleted,
    teamsProjectedFinal,
    groups: [...groupActual.values()].sort((a, b) => b.champ - a.champ),
    swimmers: [...swimmerActual.values()].sort((a, b) => b.champ - a.champ),
    swimmersPredicted: [...swimmerPredicted.values()].sort((a, b) => b.champ - a.champ),
    predictedVsActual,
    improvements: improvements.sort((a, b) => b.dropCs - a.dropCs),
    pointsByResultId,
  };
}

// Prefer later rounds (final over prelim) when choosing a swimmer's achieved time.
function roundRank(rt: RoundType): number {
  return rt === 'PRELIM' ? 0 : rt === 'TIMED_FINAL' ? 1 : 2;
}

// Ranking time for the forward projection of a not-yet-finaled event: an entrant's real
// swum time (e.g. their prelim) when present, else the seed. A DQ/NS carries a time_code
// and no usable time, so it falls back to the seed. Entrants are pre-filtered to have a
// seed, so the result is always defined.
function projectionTimeCs(r: Result): number {
  return r.time_cs != null && !r.time_code ? r.time_cs : r.seed_cs!;
}
