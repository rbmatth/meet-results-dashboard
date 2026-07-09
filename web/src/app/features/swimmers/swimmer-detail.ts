import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';
import { DropPipe, TimePipe } from '../../core/format';
import { Result } from '../../core/models';

interface Swim {
  result: Result;
  eventId: number;
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
  imports: [RouterLink, TimePipe, DropPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (swimmer(); as s) {
      <a routerLink="/swimmers" class="muted">← Swimmers</a>
      <h1>{{ s.name }}</h1>
      <p>
        <a [routerLink]="['/teams', s.team_id]" class="chip">{{ teamCode() }}</a>
        <span class="chip">{{ s.gender === 'F' ? 'Girls' : 'Boys' }}</span>
        @if (s.age != null) { <span class="chip">Age {{ s.age }}</span> }
      </p>
      <div class="stats">
        <div class="stat"><div class="n">{{ score()?.champ ?? 0 }}</div><div class="l">Champ points</div></div>
        <div class="stat"><div class="n">{{ score()?.open ?? 0 }}</div><div class="l">Open points</div></div>
        <div class="stat"><div class="n">{{ swims().length }}</div><div class="l">Swims</div></div>
      </div>
      <h2>Swims</h2>
      <table class="plain">
        <thead>
          <tr><th>Event</th><th>Div</th><th>Round</th><th>Heat</th><th class="num">Seed</th><th class="num">Time</th><th class="num">Place</th><th class="num">Drop</th><th class="num">Pts</th></tr>
        </thead>
        <tbody>
          @for (sw of swims(); track sw.result.id) {
            <tr>
              <td><a [routerLink]="['/events', sw.eventId]">{{ sw.eventTitle }}</a></td>
              <td><span class="chip" [class.champ]="sw.division === 'Champ'" [class.open]="sw.division === 'Open'">{{ sw.division }}</span></td>
              <td>{{ sw.round }}</td>
              <td>{{ sw.result.heat_group }}</td>
              <td class="num">{{ sw.result.seed_cs | time }}</td>
              <td class="num">{{ sw.result.time_code || (sw.result.time_cs | time) }}</td>
              <td class="num">{{ sw.result.place }}</td>
              <td class="num" [class.pos]="(sw.dropCs ?? 0) > 0" [class.neg]="(sw.dropCs ?? 0) < 0">{{ sw.dropCs | drop }}</td>
              <td class="num">{{ sw.points }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="muted">Swimmer not found.</p>
    }
  `,
})
export class SwimmerDetail {
  private data = inject(DataService);
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
}

function roundLabel(rt: string): string {
  return rt === 'PRELIM' ? 'Prelim' : rt === 'TIMED_FINAL' ? 'Timed Final' : 'Final';
}
function roundRank(label: string): number {
  return label === 'Prelim' ? 0 : label === 'Timed Final' ? 1 : 2;
}
