import { describe, it, expect } from 'vitest';
import {
  computeScoreBook,
  pointsForPlace,
  CHAMP_INDIVIDUAL_POINTS,
  OPEN_INDIVIDUAL_POINTS,
} from './scoring';
import { Division, MeetData, Result, RoundType } from './models';

function res(p: Partial<Result>): Result {
  return {
    id: p.id!,
    event_id: p.event_id!,
    division: p.division!,
    round_type: p.round_type!,
    is_relay: p.is_relay ?? 0,
    team_id: p.team_id ?? null,
    swimmer_id: p.swimmer_id ?? null,
    relay: p.relay ?? null,
    place: p.place ?? null,
    heat_group: null,
    seed_cs: p.seed_cs ?? null,
    seed_raw: null,
    time_cs: p.time_cs ?? null,
    time_raw: null,
    time_code: p.time_code ?? null,
    splits: [],
  };
}

function meet(events: MeetData['events'], results: Result[], teamIds: number[]): MeetData {
  return {
    meet: { code: 'T', name: 'T', facility: null, location: null, start_date: null, end_date: null, course: 'Y' },
    teams: teamIds.map((id) => ({ id, code: `T${id}`, lsc: null, name: null })),
    swimmers: [],
    events,
    results,
  };
}

const champEvent = { id: 1, number: 1, gender: 'M' as const, age_group: '9-10', min_age: 9, max_age: 10, distance: 50, stroke: 'FREE', course: 'Y', is_relay: 0, division: 'CHAMP' as Division, title: 'c' };
const openEvent = { id: 2, number: 101, gender: 'M' as const, age_group: '9-10', min_age: 9, max_age: 10, distance: 50, stroke: 'FREE', course: 'Y', is_relay: 0, division: 'OPEN' as Division, title: 'o' };
const relayEvent = { id: 3, number: 33, gender: 'M' as const, age_group: '9-10', min_age: 9, max_age: 10, distance: 200, stroke: 'FREE', course: 'Y', is_relay: 1, division: 'CHAMP' as Division, title: 'r' };

describe('pointsForPlace', () => {
  it('reads the division table by place', () => {
    expect(pointsForPlace('CHAMP', 1, 1, false)).toBe(CHAMP_INDIVIDUAL_POINTS[0]); // 32
    expect(pointsForPlace('CHAMP', 9, 1, false)).toBe(20);
    expect(pointsForPlace('OPEN', 1, 1, false)).toBe(OPEN_INDIVIDUAL_POINTS[0]); // 11
  });

  it('scores 0 beyond the table length', () => {
    expect(pointsForPlace('CHAMP', 25, 1, false)).toBe(0);
    expect(pointsForPlace('OPEN', 11, 1, false)).toBe(0);
  });

  it('splits tied points across the occupied place range', () => {
    // Two tied for 1st occupy places 1 and 2 -> (32+28)/2 = 30 each.
    expect(pointsForPlace('CHAMP', 1, 2, false)).toBe(30);
  });

  it('doubles relay points', () => {
    expect(pointsForPlace('CHAMP', 1, 1, true)).toBe(64);
    expect(pointsForPlace('OPEN', 1, 1, true)).toBe(22);
  });
});

describe('computeScoreBook', () => {
  it('scores actual finals by place and keeps champ/open independent', () => {
    const results = [
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3000 }),
      res({ id: 2, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 20, swimmer_id: 200, place: 2, time_cs: 3100 }),
      res({ id: 3, event_id: 2, division: 'OPEN', round_type: 'TIMED_FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3200 }),
    ];
    const sb = computeScoreBook(meet([champEvent, openEvent], results, [10, 20]));
    const t10 = sb.teams.find((t) => t.teamId === 10)!;
    expect(t10.champ).toBe(32);
    expect(t10.open).toBe(11);
    expect(t10).not.toHaveProperty('combined');
    expect(sb.teams.find((t) => t.teamId === 20)!.champ).toBe(28);
  });

  it('applies relay multiplier and attributes to the team only', () => {
    const results = [
      res({ id: 1, event_id: 3, division: 'CHAMP', round_type: 'FINAL', is_relay: 1, team_id: 10, place: 1, time_cs: 12000, relay: { letter: 'A', legs: [] } }),
    ];
    const sb = computeScoreBook(meet([relayEvent], results, [10]));
    expect(sb.teams.find((t) => t.teamId === 10)!.champ).toBe(64);
    expect(sb.swimmers.length).toBe(0); // relays don't create swimmer scores
  });

  it('predicts places from seed times', () => {
    // Seeds say team 20 is faster; actual final has team 10 winning -> predicted flips.
    const results = [
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'PRELIM', team_id: 10, swimmer_id: 100, seed_cs: 3100, time_cs: 3050 }),
      res({ id: 2, event_id: 1, division: 'CHAMP', round_type: 'PRELIM', team_id: 20, swimmer_id: 200, seed_cs: 3000, time_cs: 3200 }),
      res({ id: 3, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3050 }),
      res({ id: 4, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 20, swimmer_id: 200, place: 2, time_cs: 3200 }),
    ];
    const sb = computeScoreBook(meet([champEvent], results, [10, 20]));
    expect(sb.teams.find((t) => t.teamId === 10)!.champ).toBe(32); // actual winner
    expect(sb.teamsPredicted.find((t) => t.teamId === 20)!.champ).toBe(32); // seed favorite
    const pva10 = sb.predictedVsActual.find((t) => t.teamId === 10)!;
    expect(pva10.actual.champ).toBe(32);
    expect(pva10.predicted.champ).toBe(28);
    expect(pva10.deltaChamp).toBe(4); // outperformed champ seed
    expect(pva10.deltaOpen).toBe(0); // no open events
  });

  it('separates seed-through-completed and projected-final for an in-progress meet', () => {
    // Event 1 (champ) is DONE: team 20 was seed favorite but team 10 actually won.
    // Event 2 (a second champ event, id 4) is NOT swum yet: only ENTRY seeds, team 20 faster.
    const champEvent2 = { ...champEvent, id: 4, number: 2 };
    const results = [
      // completed event
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'PRELIM', team_id: 10, swimmer_id: 100, seed_cs: 3100 }),
      res({ id: 2, event_id: 1, division: 'CHAMP', round_type: 'PRELIM', team_id: 20, swimmer_id: 200, seed_cs: 3000 }),
      res({ id: 3, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3050 }),
      res({ id: 4, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 20, swimmer_id: 200, place: 2, time_cs: 3200 }),
      // not-yet-swum event (ENTRY only)
      res({ id: 5, event_id: 4, division: 'CHAMP', round_type: 'ENTRY', team_id: 10, swimmer_id: 101, seed_cs: 3300 }),
      res({ id: 6, event_id: 4, division: 'CHAMP', round_type: 'ENTRY', team_id: 20, swimmer_id: 201, seed_cs: 3200 }),
    ];
    const sb = computeScoreBook(meet([champEvent, champEvent2], results, [10, 20]));
    const get = (arr: typeof sb.teams, id: number) => arr.find((t) => t.teamId === id)!.champ;

    // Current: team 10 won the one completed event (32), team 20 second (28).
    expect(get(sb.teams, 10)).toBe(32);
    expect(get(sb.teams, 20)).toBe(28);
    // Seed through completed: only event 1's seeds -> team 20 favored (32), team 10 (28).
    expect(get(sb.teamsPredictedThroughCompleted, 20)).toBe(32);
    expect(get(sb.teamsPredictedThroughCompleted, 10)).toBe(28);
    // Original full-meet seed: both events by seed -> 20 wins both (32+32), 10 second both (28+28).
    expect(get(sb.teamsPredicted, 20)).toBe(64);
    expect(get(sb.teamsPredicted, 10)).toBe(56);
    // Projected final = actual(event1) + seed(event2):
    //   team 10: 32 (won ev1) + 28 (seed 2nd ev2) = 60
    //   team 20: 28 (2nd ev1) + 32 (seed 1st ev2) = 60
    expect(get(sb.teamsProjectedFinal, 10)).toBe(60);
    expect(get(sb.teamsProjectedFinal, 20)).toBe(60);
  });

  it('projects not-yet-finaled events from prelim times, not seeds', () => {
    // Event 1 is DONE (finaled). Event 4 has prelims swum but no final: seeds favor
    // team 20, but team 10 was faster in prelims (a seed upset). Projected final must
    // use the prelim time for event 4, while the pure-seed columns stay on seeds.
    const champEvent2 = { ...champEvent, id: 4, number: 2 };
    const results = [
      // completed event 1: team 10 wins
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3050 }),
      res({ id: 2, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 20, swimmer_id: 200, place: 2, time_cs: 3200 }),
      // event 4: prelims only. Seed favors team 20 (3200 < 3300); prelim time favors
      // team 10 (3000 < 3400).
      res({ id: 3, event_id: 4, division: 'CHAMP', round_type: 'PRELIM', team_id: 10, swimmer_id: 101, seed_cs: 3300, time_cs: 3000 }),
      res({ id: 4, event_id: 4, division: 'CHAMP', round_type: 'PRELIM', team_id: 20, swimmer_id: 201, seed_cs: 3200, time_cs: 3400 }),
    ];
    const sb = computeScoreBook(meet([champEvent, champEvent2], results, [10, 20]));
    const get = (arr: typeof sb.teams, id: number) => arr.find((t) => t.teamId === id)!.champ;

    // Seed (full): event 1 seeds are absent (finals-only rows), so only event 4 seeds
    // count -> team 20 (faster seed) 32, team 10 28.
    expect(get(sb.teamsPredicted, 20)).toBe(32);
    expect(get(sb.teamsPredicted, 10)).toBe(28);
    // Projected final = event 1 actual + event 4 by prelim time:
    //   team 10: 32 (won ev1) + 32 (fastest prelim ev4) = 64
    //   team 20: 28 (2nd ev1) + 28 (2nd prelim ev4) = 56
    expect(get(sb.teamsProjectedFinal, 10)).toBe(64);
    expect(get(sb.teamsProjectedFinal, 20)).toBe(56);
  });

  it('keeps champ and open independent (no combined total)', () => {
    const results = [
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3000 }),
      res({ id: 2, event_id: 2, division: 'OPEN', round_type: 'TIMED_FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3200 }),
    ];
    const sb = computeScoreBook(meet([champEvent, openEvent], results, [10]));
    const s = sb.swimmers.find((x) => x.swimmerId === 100)!;
    expect(s.champ).toBe(32);
    expect(s.open).toBe(11);
    expect(s).not.toHaveProperty('combined'); // never summed
  });

  it('predicts an unswum event from its ENTRY (psych-sheet) round', () => {
    // No PRELIM/FINAL at all for this event yet -> entryRoundResults must fall back
    // to ENTRY so "predicted" includes events that haven't been swum.
    const results = [
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'ENTRY', team_id: 10, swimmer_id: 100, seed_cs: 3000 }),
      res({ id: 2, event_id: 1, division: 'CHAMP', round_type: 'ENTRY', team_id: 20, swimmer_id: 200, seed_cs: 3100 }),
    ];
    const sb = computeScoreBook(meet([champEvent], results, [10, 20]));
    expect(sb.teamsPredicted.find((t) => t.teamId === 10)!.champ).toBe(32); // faster seed
    expect(sb.teamsPredicted.find((t) => t.teamId === 20)!.champ).toBe(28);
    // ENTRY rows never have a place, so no actual points are ever awarded from them.
    expect(sb.teams.length).toBe(0);
  });

  it('prefers a real round over ENTRY once the event has been swum', () => {
    const results = [
      res({ id: 1, event_id: 2, division: 'OPEN', round_type: 'ENTRY', team_id: 10, swimmer_id: 100, seed_cs: 3100 }),
      res({ id: 2, event_id: 2, division: 'OPEN', round_type: 'TIMED_FINAL', team_id: 20, swimmer_id: 200, seed_cs: 3000, place: 1, time_cs: 2900 }),
    ];
    const sb = computeScoreBook(meet([openEvent], results, [10, 20]));
    // Predicted uses the real TIMED_FINAL entrants only (team 20), not the stale ENTRY row.
    expect(sb.teamsPredicted.find((t) => t.teamId === 20)!.open).toBe(11);
    expect(sb.teamsPredicted.find((t) => t.teamId === 10)).toBeUndefined();
  });

  it('computes improvement as seed minus achieved time', () => {
    const results = [
      res({ id: 1, event_id: 1, division: 'CHAMP', round_type: 'PRELIM', team_id: 10, swimmer_id: 100, seed_cs: 3100, time_cs: 3080 }),
      res({ id: 2, event_id: 1, division: 'CHAMP', round_type: 'FINAL', team_id: 10, swimmer_id: 100, place: 1, time_cs: 3050 }),
    ];
    const sb = computeScoreBook(meet([champEvent], results, [10]));
    expect(sb.improvements.length).toBe(1);
    // Achieved = final 3050, seed 3100 -> drop 50 cs (faster).
    expect(sb.improvements[0].dropCs).toBe(50);
  });
});
