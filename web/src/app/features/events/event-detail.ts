import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { formatCs, formatDropCs } from '../../core/format';
import { Result, RoundType } from '../../core/models';
import { DataTable, Column } from '../../shared/data-table';

interface RoundBlock {
  type: RoundType;
  label: string;
  results: Result[];
}

interface RelayRow {
  result: Result;
  place: number | null;
  teamCode: string;
  letter: string;
  seedTime: number | null;
  time: number | null;
  timeCode: string | null;
  points: number;
  legsDisplay: string;
  splitsDisplay: string;
}

interface IndividualRow {
  result: Result;
  place: number | null;
  heat: string | number | null;
  name: string;
  teamCode: string;
  age: number | null;
  seedTime: number | null;
  time: number | null;
  timeCode: string | null;
  drop: number | null;
  points: number;
}

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [RouterLink, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (event(); as e) {
      <a [routerLink]="div.link('events')" class="muted">← Events</a>
      <h1>{{ e.title.replace(pfx, '') }}</h1>
      <p>
        <span class="chip" [class.champ]="e.division === 'CHAMP'" [class.open]="e.division === 'OPEN'">{{ e.division === 'CHAMP' ? 'Champ' : 'Open' }}</span>
        <span class="chip">Event {{ e.number }}</span>
        <span class="chip">{{ e.is_relay ? 'Relay' : 'Individual' }}</span>
      </p>

      @for (block of blocks(); track block.type) {
        <h2>{{ block.label }}</h2>
        @if (e.is_relay) {
          <app-data-table [columns]="relayColumns()" [rows]="relayRows(block.results)" [initialSort]="{ key: 'place', dir: 'asc' }" searchPlaceholder="Search teams…" />
        } @else {
          <app-data-table [columns]="individualColumns()" [rows]="individualRows(block.results)" [initialSort]="{ key: 'place', dir: 'asc' }" searchPlaceholder="Search swimmers…" />
        }
      }
    } @else {
      <p class="muted">Event not found.</p>
    }
  `,
  styles: [`
    .legs { display: flex; flex-wrap: wrap; gap: .6rem; }
    .leg { font-size: .8rem; }
    .splits { font-size: .75rem; font-variant-numeric: tabular-nums; margin-top: .2rem; }
  `],
})
export class EventDetail {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  private route = inject(ActivatedRoute);
  private id = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('id')))), { initialValue: 0 });
  pfx = /^Event\s+\d+\s+/;

  event = computed(() => this.data.event(this.id()));

  blocks = computed<RoundBlock[]>(() => {
    const results = this.data.resultsByEvent().get(this.id()) ?? [];
    const order: RoundType[] = ['FINAL', 'TIMED_FINAL', 'PRELIM'];
    return order
      .map((type) => ({
        type,
        label: type === 'PRELIM' ? 'Preliminaries' : type === 'TIMED_FINAL' ? 'Timed Final' : 'Finals',
        results: results.filter((r) => r.round_type === type).sort(byPlace),
      }))
      .filter((b) => b.results.length > 0);
  });

  pts(resultId: number): string {
    const p = this.data.scoreBook()?.pointsByResultId.get(resultId);
    return p ? String(Math.round(p * 100) / 100) : '';
  }
  code(id: number | null): string { return this.data.teamCode(id); }
  name(id: number | null): string { return this.data.swimmer(id)?.name ?? ''; }
  age(id: number | null): number | null { return this.data.swimmer(id)?.age ?? null; }
  drop(r: Result): number { return this.dropVal(r) ?? 0; }
  dropVal(r: Result): number | null {
    return r.seed_cs != null && r.time_cs != null && !r.time_code ? r.seed_cs - r.time_cs : null;
  }
  splitStr(r: Result): string {
    return r.splits.map((s) => formatCs(s.cumulative_cs) + (s.interval_cs != null ? ` (${formatCs(s.interval_cs)})` : '')).join('  ');
  }

  relayRows(results: Result[]): RelayRow[] {
    return results.map((r) => ({
      result: r,
      place: r.place,
      teamCode: this.code(r.team_id),
      letter: r.relay?.letter ?? '',
      seedTime: r.seed_cs,
      time: r.time_cs,
      timeCode: r.time_code,
      points: Math.round(this.pts(r.id) as any * 100) / 100,
      legsDisplay: (r.relay?.legs ?? []).map((l) => `${l.leg_no}) ${l.name} ${l.age}`).join(', '),
      splitsDisplay: this.splitStr(r),
    }));
  }

  individualRows(results: Result[]): IndividualRow[] {
    return results.map((r) => ({
      result: r,
      place: r.place,
      heat: r.heat_group,
      name: this.name(r.swimmer_id),
      teamCode: this.code(r.team_id),
      age: this.age(r.swimmer_id),
      seedTime: r.seed_cs,
      time: r.time_cs,
      timeCode: r.time_code,
      drop: this.dropVal(r),
      points: Math.round(this.pts(r.id) as any * 100) / 100,
    }));
  }

  relayColumns(): Column<RelayRow>[] {
    return [
      { key: 'place', header: 'Pl', value: (r) => r.place ?? 0, numeric: true },
      { key: 'teamCode', header: 'Team', value: (r) => r.teamCode, display: (r) => `${r.teamCode} '${r.letter}'`, link: (r) => this.div.link('teams', r.result.team_id ?? 0) },
      { key: 'seedTime', header: 'Seed', value: (r) => r.seedTime ?? 0, display: (r) => formatCs(r.seedTime), numeric: true },
      { key: 'time', header: 'Time', value: (r) => r.time ?? 0, display: (r) => r.timeCode || formatCs(r.time), numeric: true },
      { key: 'points', header: 'Pts', value: (r) => r.points, numeric: true },
      { key: 'legsDisplay', header: 'Swimmers & splits', value: (r) => r.legsDisplay, display: (r) => r.legsDisplay + (r.splitsDisplay ? `\n${r.splitsDisplay}` : '') },
    ];
  }

  individualColumns(): Column<IndividualRow>[] {
    return [
      { key: 'place', header: 'Pl', value: (r) => r.place ?? 0, numeric: true },
      { key: 'heat', header: 'Heat', value: (r) => r.heat },
      { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => this.div.link('swimmers', r.result.swimmer_id ?? 0) },
      { key: 'teamCode', header: 'Team', value: (r) => r.teamCode, link: (r) => this.div.link('teams', r.result.team_id ?? 0) },
      { key: 'age', header: 'Age', value: (r) => r.age ?? 0, numeric: true },
      { key: 'seedTime', header: 'Seed', value: (r) => r.seedTime ?? 0, display: (r) => formatCs(r.seedTime), numeric: true },
      { key: 'time', header: 'Time', value: (r) => r.time ?? 0, display: (r) => r.timeCode || formatCs(r.time), numeric: true },
      {
        key: 'drop', header: 'Drop', value: (r) => r.drop ?? 0, numeric: true,
        display: (r) => formatDropCs(r.drop),
        cellClass: (r) => ((r.drop ?? 0) > 0 ? 'pos' : (r.drop ?? 0) < 0 ? 'neg' : null),
      },
      { key: 'points', header: 'Pts', value: (r) => r.points, numeric: true },
    ];
  }
}

function byPlace(a: Result, b: Result): number {
  if (a.place == null && b.place == null) return 0;
  if (a.place == null) return 1;
  if (b.place == null) return -1;
  return a.place - b.place;
}
