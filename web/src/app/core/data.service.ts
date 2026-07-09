import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventInfo, MeetData, MeetIndexEntry, Result, Swimmer, Team } from './models';
import { computeScoreBook, ScoreBook } from './scoring';

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

  readonly scoreBook = computed<ScoreBook | null>(() => {
    const d = this.data();
    return d ? computeScoreBook(d) : null;
  });

  readonly teamScoreById = computed(() => {
    const m = new Map<number, ScoreBook['teams'][number]>();
    for (const t of this.scoreBook()?.teams ?? []) m.set(t.teamId, t);
    return m;
  });

  constructor() {
    // Only fetch in the browser: relative URLs are invalid during server prerendering.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.init();
    } else {
      this.loading.set(false);
    }
  }

  private async init(): Promise<void> {
    try {
      const idx = await firstValueFrom(this.http.get<MeetIndexEntry[]>('data/index.json'));
      this.index.set(idx);
      if (idx.length) await this.loadMeet(idx[0].code);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMeet(code: string): Promise<void> {
    this.loading.set(true);
    try {
      const d = await firstValueFrom(this.http.get<MeetData>(`data/${code}.json`));
      this.data.set(d);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
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
