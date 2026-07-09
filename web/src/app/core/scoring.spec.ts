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
    teams: teamIds.map((id) => ({ id, code: `T${id}`, lsc: null })),
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
    expect(t10.combined).toBe(43);
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
    expect(pva10.actual.combined).toBe(32);
    expect(pva10.predicted.combined).toBe(28);
    expect(pva10.deltaCombined).toBe(4); // outperformed seed
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
