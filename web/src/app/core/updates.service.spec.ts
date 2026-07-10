import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DataService } from './data.service';
import { UpdatesService } from './updates.service';
import { Division, EventInfo, MeetData, Result, RoundType, Swimmer, Team } from './models';

function team(id: number, code: string): Team {
  return { id, code, lsc: null, name: null };
}
function swimmer(id: number, teamId: number, name: string): Swimmer {
  return { id, team_id: teamId, name, gender: 'F', age: 10 };
}
function event(id: number, number: number, ageGroup: string, division: Division): EventInfo {
  return {
    id, number, gender: 'F', age_group: ageGroup, min_age: null, max_age: null,
    distance: 50, stroke: 'FREE', course: 'Y', is_relay: 0, division,
    title: `Event ${number} Girls ${ageGroup} 50 Yard Freestyle ${division === 'OPEN' ? 'Open' : 'Champ'}`,
  };
}
function result(p: Partial<Result> & { id: number; event_id: number; division: Division; round_type: RoundType }): Result {
  return {
    is_relay: 0, team_id: null, swimmer_id: null, relay: null, place: null,
    heat_group: null, seed_cs: null, seed_raw: null, time_cs: null, time_raw: null, time_code: null,
    splits: [], ...p,
  };
}
function meetData(code: string, teams: Team[], swimmers: Swimmer[], events: EventInfo[], results: Result[]): MeetData {
  return {
    meet: { code, name: code, facility: null, location: null, start_date: null, end_date: null, course: 'Y' },
    teams, swimmers, events, results,
  };
}

describe('UpdatesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('shows nothing new on a first-ever visit and silently establishes a baseline', () => {
    const svc = TestBed.inject(UpdatesService);
    const data = TestBed.inject(DataService);
    data.data.set(meetData(
      'T1', [team(1, 'T1')], [swimmer(1, 1, 'A, B')], [event(10, 1, '9-10', 'CHAMP')],
      [result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 })],
    ));
    TestBed.tick();

    expect(svc.newCount()).toBe(0);
    expect(svc.changedEvents()).toEqual([]);
    // The baseline was saved, not left empty — a later load with the same data stays quiet.
    expect(localStorage.getItem('mrd:seen:T1')).not.toBeNull();
  });

  it('detects new results added to an already-scored event, and new events', () => {
    const svc = TestBed.inject(UpdatesService);
    const data = TestBed.inject(DataService);
    const ev1 = event(10, 1, '9-10', 'CHAMP');
    const ev2 = event(20, 2, '11-12', 'CHAMP');
    const swimmers = [swimmer(1, 1, 'A, B'), swimmer(2, 1, 'C, D'), swimmer(3, 1, 'E, F')];
    const teams = [team(1, 'T1')];

    // Visit 1: event 1 has one placed swimmer.
    data.data.set(meetData('T2', teams, swimmers, [ev1, ev2], [
      result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 }),
    ]));
    TestBed.tick();
    expect(svc.newCount()).toBe(0);

    // Visit 2: event 1 gains a second placed swimmer (new result); event 2 gets its
    // first results ever (new event). Note the id space is shifted (2 -> 101, 102) to
    // simulate a re-parse reassigning raw ids — the natural key must still line up.
    data.data.set(meetData('T2', teams, swimmers, [ev1, ev2], [
      result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 }),
      result({ id: 101, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 2, team_id: 1, place: 2, time_cs: 3100 }),
      result({ id: 102, event_id: 20, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 3, team_id: 1, place: 1, time_cs: 4000 }),
    ]));
    TestBed.tick();

    expect(svc.newCount()).toBe(2);
    const changed = svc.changedEvents();
    expect(changed).toEqual([
      { eventId: 10, number: 1, title: 'Girls 9-10 50 Yard Freestyle Champ', division: 'CHAMP', newCount: 1, isNewEvent: false },
      { eventId: 20, number: 2, title: 'Girls 11-12 50 Yard Freestyle Champ', division: 'CHAMP', newCount: 1, isNewEvent: true },
    ]);
  });

  it('markSeen() clears the diff going forward', () => {
    const svc = TestBed.inject(UpdatesService);
    const data = TestBed.inject(DataService);
    const ev1 = event(10, 1, '9-10', 'CHAMP');
    const teams = [team(1, 'T1')];
    const swimmers = [swimmer(1, 1, 'A, B'), swimmer(2, 1, 'C, D')];

    data.data.set(meetData('T3', teams, swimmers, [ev1], [
      result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 }),
    ]));
    TestBed.tick();

    data.data.set(meetData('T3', teams, swimmers, [ev1], [
      result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 }),
      result({ id: 2, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 2, team_id: 1, place: 2, time_cs: 3100 }),
    ]));
    TestBed.tick();
    expect(svc.newCount()).toBe(1);

    svc.markSeen();
    expect(svc.newCount()).toBe(0);
    expect(svc.changedEvents()).toEqual([]);
  });

  it('diffs to zero across a simulated re-parse where only raw ids shift (not content)', () => {
    // This is the regression case the natural-key design exists for: parse_meet.js
    // fully reloads a meet's rows every run, and result/event/swimmer share SQLite's
    // default (non-AUTOINCREMENT) rowid space across ALL meets in meets.db, so
    // re-parsing byte-identical source data is not guaranteed to reproduce the same
    // numeric ids. Diffing on raw ids would show "everything is new" here; the
    // natural key must not.
    const svc = TestBed.inject(UpdatesService);
    const data = TestBed.inject(DataService);
    const teams = [team(1, 'T1')];
    const swimmers = [swimmer(1, 1, 'A, B')];

    data.data.set(meetData('T4', teams, swimmers, [event(10, 1, '9-10', 'CHAMP')], [
      result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 }),
    ]));
    TestBed.tick();
    expect(svc.newCount()).toBe(0);

    // "Re-parse": same content, but event/swimmer/result ids have all shifted upward.
    data.data.set(meetData('T4', teams, [swimmer(501, 1, 'A, B')], [event(510, 1, '9-10', 'CHAMP')], [
      result({ id: 999, event_id: 510, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 501, team_id: 1, place: 1, time_cs: 3000 }),
    ]));
    TestBed.tick();

    expect(svc.newCount()).toBe(0);
    expect(svc.changedEvents()).toEqual([]);
  });

  it('keeps separate baselines per meet code', () => {
    const svc = TestBed.inject(UpdatesService);
    const data = TestBed.inject(DataService);
    const teams = [team(1, 'T1')];
    const swimmers = [swimmer(1, 1, 'A, B')];
    const ev = event(10, 1, '9-10', 'CHAMP');
    const r = result({ id: 1, event_id: 10, division: 'CHAMP', round_type: 'FINAL', swimmer_id: 1, team_id: 1, place: 1, time_cs: 3000 });

    data.data.set(meetData('T5A', teams, swimmers, [ev], [r]));
    TestBed.tick();
    expect(svc.newCount()).toBe(0); // first visit to T5A

    data.data.set(meetData('T5B', teams, swimmers, [ev], [r]));
    TestBed.tick();
    expect(svc.newCount()).toBe(0); // first visit to T5B too, independently
  });
});
