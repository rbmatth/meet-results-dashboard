// TypeScript shapes mirroring the JSON emitted by export_json.js.

export type Division = 'CHAMP' | 'OPEN';
export type RoundType = 'PRELIM' | 'FINAL' | 'TIMED_FINAL';
export type Gender = 'M' | 'F' | 'X';

export interface Team {
  id: number;
  code: string;
  lsc: string | null;
}

export interface Swimmer {
  id: number;
  team_id: number;
  name: string;
  gender: Gender;
  age: number | null;
}

export interface EventInfo {
  id: number;
  number: number;
  gender: Gender;
  age_group: string;
  min_age: number | null;
  max_age: number | null;
  distance: number;
  stroke: string;
  course: string;
  is_relay: number; // 0 | 1
  division: Division;
  title: string;
}

export interface RelayLeg {
  leg_no: number;
  swimmer_id: number | null;
  name: string;
  age: number | null;
}

export interface Split {
  split_no: number;
  distance: number | null;
  cumulative_cs: number | null;
  interval_cs: number | null;
}

export interface Result {
  id: number;
  event_id: number;
  division: Division;
  round_type: RoundType;
  is_relay: number; // 0 | 1
  team_id: number | null;
  swimmer_id: number | null;
  relay: { letter: string; legs: RelayLeg[] } | null;
  place: number | null;
  heat_group: string | null;
  seed_cs: number | null;
  seed_raw: string | null;
  time_cs: number | null;
  time_raw: string | null;
  time_code: string | null;
  splits: Split[];
}

export interface MeetInfo {
  code: string;
  name: string;
  facility: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  course: string | null;
}

export interface MeetData {
  meet: MeetInfo;
  teams: Team[];
  swimmers: Swimmer[];
  events: EventInfo[];
  results: Result[];
}

export interface MeetIndexEntry {
  code: string;
  name: string;
  start_date: string;
  end_date: string;
}
