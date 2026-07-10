import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Division, EventInfo, MeetData, MeetIndexEntry, Result, Swimmer, Team } from './models';
import { computeScoreBook, ScoreBook } from './scoring';

// How often an open tab checks for fresh data during a live meet. There's no push
// mechanism (see refresh-and-push.js), so this is the only thing that turns a stale,
// already-open tab into a live one — pairs with UpdatesService's notification bell,
// which otherwise only ever sees new data on a manual page reload.
const POLL_INTERVAL_MS = 75_000;

@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);

  readonly index = signal<MeetIndexEntry[]>([]);
  readonly data = signal<MeetData | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // Lookup indexes ------------------------------------------------------------
  readonly teamById = computed(() => index(this.data()?.teams ?? []));
  readonly swimmerById = computed(() => index(this.data()?.swimmers ?? []));
  readonly eventById = computed(() => index(this.data()?.events ?? []));

  readonly swimmersByTeam = computed(() => {
    const m = new Map<number, Swimmer[]>();
    for (const s of this.data()?.swimmers ?? []) push(m, s.team_id, s);
    return m;
  });

  readonly resultsBySwimmer = computed(() => {
    const m = new Map<number, Result[]>();
    for (const r of this.data()?.results ?? []) if (r.swimmer_id != null) push(m, r.swimmer_id, r);
    return m;
  });

  readonly resultsByEvent = computed(() => {
    const m = new Map<number, Result[]>();
    for (const r of this.data()?.results ?? []) push(m, r.event_id, r);
    return m;
  });

  // Which divisions each swimmer participated in (from individual results), so lists can
  // scope to the active division.
  readonly divisionsBySwimmer = computed(() => {
    const m = new Map<number, Set<Division>>();
    for (const r of this.data()?.results ?? []) {
      if (r.swimmer_id == null) continue;
      let set = m.get(r.swimmer_id);
      if (!set) m.set(r.swimmer_id, (set = new Set()));
      set.add(r.division);
    }
    return m;
  });

  readonly scoreBook = computed<ScoreBook | null>(() => {
    const d = this.data();
    return d ? computeScoreBook(d) : null;
  });

  readonly teamScoreById = computed(() => {
    const m = new Map<number, ScoreBook['teams'][number]>();
    for (const t of this.scoreBook()?.teams ?? []) m.set(t.teamId, t);
    return m;
  });

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private indexPromise?: Promise<MeetIndexEntry[]>;
  private loadedCode: string | null = null;

  constructor() {
    if (!this.isBrowser) {
      this.loading.set(false);
      return;
    }
    const id = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  /** Load (once) and return the meet index. Safe to call repeatedly. */
  ensureIndex(): Promise<MeetIndexEntry[]> {
    if (!this.indexPromise) {
      this.indexPromise = this.isBrowser
        ? firstValueFrom(this.http.get<MeetIndexEntry[]>('data/index.json'))
            .then((idx) => (this.index.set(idx), idx))
            .catch((e: unknown) => (this.error.set(errMsg(e)), []))
        : Promise.resolve([]);
    }
    return this.indexPromise;
  }

  /** Load a meet's data by code (the meet named in the URL). Deduped. */
  async loadMeet(code: string): Promise<void> {
    if (!this.isBrowser || !code || code === this.loadedCode) return;
    this.loadedCode = code;
    this.loading.set(true);
    this.error.set(null);
    try {
      const d = await firstValueFrom(this.http.get<MeetData>(`data/${encodeURIComponent(code)}.json`));
      this.data.set(d);
    } catch (e: unknown) {
      this.loadedCode = null;
      this.error.set(errMsg(e));
    } finally {
      this.loading.set(false);
    }
  }

  // Re-fetch the index and, if the loaded meet's export changed, its data — cache-busted
  // since GitHub Pages sets caching headers on the JSON assets. Swallow failures; a bad
  // poll just tries again next interval instead of surfacing a transient network error.
  private async poll(): Promise<void> {
    if (!this.loadedCode) return;
    try {
      const bust = `t=${Date.now()}`;
      const idx = await firstValueFrom(this.http.get<MeetIndexEntry[]>(`data/index.json?${bust}`));
      this.index.set(idx);
      const entry = idx.find((m) => m.code === this.loadedCode);
      const current = this.data();
      if (!entry?.generated_at || !current || entry.generated_at === current.meet.generated_at) return;
      const d = await firstValueFrom(
        this.http.get<MeetData>(`data/${encodeURIComponent(this.loadedCode)}.json?${bust}`),
      );
      this.data.set(d);
    } catch {
      // transient network error — retried next interval
    }
  }

  team(id: number | null | undefined): Team | undefined {
    return id == null ? undefined : this.teamById().get(id);
  }
  swimmer(id: number | null | undefined): Swimmer | undefined {
    return id == null ? undefined : this.swimmerById().get(id);
  }
  event(id: number | null | undefined): EventInfo | undefined {
    return id == null ? undefined : this.eventById().get(id);
  }
  teamCode(id: number | null | undefined): string {
    return this.team(id)?.code ?? '';
  }
}

function index<T extends { id: number }>(items: T[]): Map<number, T> {
  const m = new Map<number, T>();
  for (const it of items) m.set(it.id, it);
  return m;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  let arr = m.get(k);
  if (!arr) m.set(k, (arr = []));
  arr.push(v);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
