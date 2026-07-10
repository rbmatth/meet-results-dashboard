import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DataService } from './data.service';
import { Division, EventInfo, Result, Swimmer } from './models';

const STORAGE_PREFIX = 'mrd:seen:';

export interface ChangedEvent {
  eventId: number;
  number: number;
  title: string;
  division: Division;
  newCount: number;
  /** True when none of this event's current results were seen before (was fully
   * unscored/entry-only); false when some results were already known (e.g. finals
   * posted after prelims, or extra heats added to an already-scored event). */
  isNewEvent: boolean;
}

// "What's new since your last visit" for the currently loaded meet — entirely
// client-side, diffed against a baseline persisted in localStorage per meet code.
//
// Diffing uses a content-derived natural key, NOT raw result.id: parse_meet.js fully
// deletes and re-inserts a meet's rows on every parse, and result/event/swimmer share
// SQLite's default (non-AUTOINCREMENT) rowid allocation across ALL meets in meets.db —
// so re-parsing unchanged source data is not guaranteed to reproduce the same numeric
// IDs. A natural key (event number/age-group/division + round + swimmer or relay
// identity — all derived from source text, not DB-assigned) stays stable across
// re-parses of the same underlying data.
@Injectable({ providedIn: 'root' })
export class UpdatesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly data = inject(DataService);

  private readonly baseline = signal<Set<string> | null>(null);
  private readonly loadedForCode = signal<string | null>(null);

  constructor() {
    effect(() => {
      const d = this.data.data();
      if (!this.isBrowser || !d) return;
      const code = d.meet.code;
      if (this.loadedForCode() === code) return; // already loaded/established for this meet

      const events = this.data.eventById();
      const swimmers = this.data.swimmerById();
      const stored = readBaseline(code);
      // First-ever visit to this meet: silently establish the baseline (don't dump
      // the whole meet as "N thousand new results"). Later visits show real deltas.
      const keys = stored ?? new Set(d.results.map((r) => naturalKey(r, events, swimmers)));
      if (!stored) writeBaseline(code, keys);
      this.baseline.set(keys);
      this.loadedForCode.set(code);
    });
  }

  readonly newResults = computed<Result[]>(() => {
    const d = this.data.data();
    const base = this.baseline();
    if (!d || !base || this.loadedForCode() !== d.meet.code) return [];
    const events = this.data.eventById();
    const swimmers = this.data.swimmerById();
    return d.results.filter((r) => !base.has(naturalKey(r, events, swimmers)));
  });

  /** Number of distinct events with new results — what the notifications bell badges,
   * since "17 new results" is noisy but "3 events changed" is a useful glance. */
  readonly changedEventCount = computed(() => this.changedEvents().length);

  readonly changedEvents = computed<ChangedEvent[]>(() => {
    const news = this.newResults();
    if (!news.length) return [];
    const events = this.data.eventById();
    const swimmers = this.data.swimmerById();
    const base = this.baseline()!;
    const resultsByEvent = this.data.resultsByEvent();

    const newCountByEvent = new Map<number, number>();
    for (const r of news) newCountByEvent.set(r.event_id, (newCountByEvent.get(r.event_id) ?? 0) + 1);

    const out: ChangedEvent[] = [];
    for (const [eventId, newCount] of newCountByEvent) {
      const ev = events.get(eventId);
      if (!ev) continue;
      const allForEvent = resultsByEvent.get(eventId) ?? [];
      const isNewEvent = allForEvent.every((r) => !base.has(naturalKey(r, events, swimmers)));
      out.push({
        eventId,
        number: ev.number,
        title: ev.title.replace(/^Event\s+\d+\s+/, ''),
        division: ev.division,
        newCount,
        isNewEvent,
      });
    }
    return out.sort((a, b) => a.number - b.number);
  });

  /** Snapshot the current data as "seen" — call when the notification panel opens. */
  markSeen(): void {
    const d = this.data.data();
    if (!this.isBrowser || !d) return;
    const events = this.data.eventById();
    const swimmers = this.data.swimmerById();
    const keys = new Set(d.results.map((r) => naturalKey(r, events, swimmers)));
    this.baseline.set(keys);
    this.loadedForCode.set(d.meet.code);
    writeBaseline(d.meet.code, keys);
  }
}

function naturalKey(r: Result, events: Map<number, EventInfo>, swimmers: Map<number, Swimmer>): string {
  const ev = events.get(r.event_id);
  const evPart = ev ? `${ev.number}|${ev.age_group}|${ev.division}` : `ev${r.event_id}`;
  if (r.relay) {
    return `${evPart}|${r.round_type}|rl:${r.team_id ?? ''}|${r.relay.letter}`;
  }
  const sw = r.swimmer_id != null ? swimmers.get(r.swimmer_id) : undefined;
  const swPart = sw ? `${sw.team_id}|${sw.name}` : `sw${r.swimmer_id}`;
  return `${evPart}|${r.round_type}|sw:${swPart}`;
}

function readBaseline(code: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + code);
    if (!raw) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null; // storage unavailable (private browsing, etc.) — treat as first visit
  }
}

function writeBaseline(code: string, keys: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + code, JSON.stringify([...keys]));
  } catch {
    // storage unavailable — notifications just won't persist across reloads this session
  }
}
