import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { formatCs, formatDropCs } from '../../core/format';
import { Division, Result } from '../../core/models';
import { DataTable, Column } from '../../shared/data-table';

interface Swim {
  result: Result;
  eventId: number;
  eventDivision: Division;
  eventTitle: string;
  eventNumber: number;
  division: string;
  round: string;
  points: number | null;
  dropCs: number | null;
}

@Component({
  selector: 'app-swimmer-detail',
  standalone: true,
  imports: [RouterLink, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (swimmer(); as s) {
      <a [routerLink]="div.link('swimmers')" class="muted">← Swimmers</a>
      <h1>{{ s.name }}</h1>
      <p>
        <a [routerLink]="div.link('teams', s.team_id)" class="chip">{{ teamCode() }}</a>
        <span class="chip">{{ s.gender === 'F' ? 'Girls' : 'Boys' }}</span>
        @if (s.age != null) { <span class="chip">Age {{ s.age }}</span> }
      </p>
      <div class="stats">
        <div class="stat"><div class="n">{{ score()?.[div.key()] ?? 0 }}</div><div class="l">{{ div.label() }} points</div></div>
        <div class="stat"><div class="n">{{ swims().length }}</div><div class="l">Swims (all)</div></div>
      </div>
      <h2>Swims</h2>
      <app-data-table [columns]="swimColumns()" [rows]="swims()" [initialSort]="{ key: 'eventNumber', dir: 'asc' }" searchPlaceholder="Search swims…" />
    } @else {
      <p class="muted">Swimmer not found.</p>
    }
  `,
})
export class SwimmerDetail {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  private route = inject(ActivatedRoute);
  private id = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('id')))), { initialValue: 0 });

  swimmer = computed(() => this.data.swimmer(this.id()));
  teamCode = computed(() => this.data.teamCode(this.swimmer()?.team_id));

  score = computed(() => {
    const sb = this.data.scoreBook();
    return sb?.swimmers.find((s) => s.swimmerId === this.id());
  });

  swims = computed<Swim[]>(() => {
    const sb = this.data.scoreBook();
    const results = this.data.resultsBySwimmer().get(this.id()) ?? [];
    return results
      .map((result) => {
        const ev = this.data.event(result.event_id);
        const dropCs = result.seed_cs != null && result.time_cs != null && !result.time_code ? result.seed_cs - result.time_cs : null;
        return {
          result,
          eventId: result.event_id,
          eventDivision: result.division,
          eventTitle: ev ? ev.title.replace(/^Event\s+\d+\s+/, '') : String(result.event_id),
          eventNumber: ev?.number ?? 0,
          division: ev?.division === 'OPEN' ? 'Open' : 'Champ',
          round: roundLabel(result.round_type),
          points: sb?.pointsByResultId.get(result.id) ?? null,
          dropCs,
        };
      })
      .sort((a, b) => a.eventNumber - b.eventNumber || roundRank(a.round) - roundRank(b.round));
  });

  swimColumns = (): Column<Swim>[] => [
    { key: 'eventTitle', header: 'Event', value: (s) => s.eventTitle, link: (s) => this.div.eventLink({ id: s.eventId, division: s.eventDivision }) },
    { key: 'division', header: 'Div', value: (s) => s.division },
    { key: 'round', header: 'Round', value: (s) => s.round },
    { key: 'heat', header: 'Heat', value: (s) => s.result.heat_group },
    { key: 'seed', header: 'Seed', value: (s) => s.result.seed_cs ?? 0, display: (s) => formatCs(s.result.seed_cs), numeric: true },
    { key: 'time', header: 'Time', value: (s) => s.result.time_cs ?? 0, display: (s) => s.result.time_code || formatCs(s.result.time_cs), numeric: true },
    { key: 'place', header: 'Place', value: (s) => s.result.place ?? 0, numeric: true },
    {
      key: 'drop', header: 'Drop', value: (s) => s.dropCs ?? 0, numeric: true,
      display: (s) => formatDropCs(s.dropCs),
      cellClass: (s) => ((s.dropCs ?? 0) > 0 ? 'pos' : (s.dropCs ?? 0) < 0 ? 'neg' : null),
    },
    { key: 'points', header: 'Pts', value: (s) => s.points ?? 0, numeric: true },
  ];
}

function roundLabel(rt: string): string {
  return rt === 'PRELIM' ? 'Prelim' : rt === 'TIMED_FINAL' ? 'Timed Final' : 'Final';
}
function roundRank(label: string): number {
  return label === 'Prelim' ? 0 : label === 'Timed Final' ? 1 : 2;
}
