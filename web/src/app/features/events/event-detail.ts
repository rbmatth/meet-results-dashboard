import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';
import { DropPipe, TimePipe, formatCs } from '../../core/format';
import { Result, RoundType } from '../../core/models';

interface RoundBlock {
  type: RoundType;
  label: string;
  results: Result[];
}

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [RouterLink, TimePipe, DropPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (event(); as e) {
      <a routerLink="/events" class="muted">← Events</a>
      <h1>{{ e.title.replace(pfx, '') }}</h1>
      <p>
        <span class="chip" [class.champ]="e.division === 'CHAMP'" [class.open]="e.division === 'OPEN'">{{ e.division === 'CHAMP' ? 'Champ' : 'Open' }}</span>
        <span class="chip">Event {{ e.number }}</span>
        <span class="chip">{{ e.is_relay ? 'Relay' : 'Individual' }}</span>
      </p>

      @for (block of blocks(); track block.type) {
        <h2>{{ block.label }}</h2>
        @if (e.is_relay) {
          <table class="plain">
            <thead><tr><th class="num">Pl</th><th>Team</th><th class="num">Seed</th><th class="num">Time</th><th class="num">Pts</th><th>Swimmers &amp; splits</th></tr></thead>
            <tbody>
              @for (r of block.results; track r.id) {
                <tr>
                  <td class="num">{{ r.place }}</td>
                  <td><a [routerLink]="['/teams', r.team_id]">{{ code(r.team_id) }}</a> '{{ r.relay?.letter }}'</td>
                  <td class="num">{{ r.seed_cs | time }}</td>
                  <td class="num">{{ r.time_code || (r.time_cs | time) }}</td>
                  <td class="num">{{ pts(r.id) }}</td>
                  <td>
                    <div class="legs">
                      @for (leg of r.relay?.legs ?? []; track leg.leg_no) {
                        <span class="leg">{{ leg.leg_no }}) {{ leg.name }} {{ leg.age }}</span>
                      }
                    </div>
                    @if (r.splits.length) { <div class="splits muted">{{ splitStr(r) }}</div> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <table class="plain">
            <thead><tr><th class="num">Pl</th><th>Heat</th><th>Name</th><th>Team</th><th class="num">Age</th><th class="num">Seed</th><th class="num">Time</th><th class="num">Drop</th><th class="num">Pts</th></tr></thead>
            <tbody>
              @for (r of block.results; track r.id) {
                <tr>
                  <td class="num">{{ r.place }}</td>
                  <td>{{ r.heat_group }}</td>
                  <td><a [routerLink]="['/swimmers', r.swimmer_id]">{{ name(r.swimmer_id) }}</a></td>
                  <td><a [routerLink]="['/teams', r.team_id]">{{ code(r.team_id) }}</a></td>
                  <td class="num">{{ age(r.swimmer_id) }}</td>
                  <td class="num">{{ r.seed_cs | time }}</td>
                  <td class="num">{{ r.time_code || (r.time_cs | time) }}</td>
                  <td class="num" [class.pos]="drop(r) > 0" [class.neg]="drop(r) < 0">{{ (dropVal(r)) | drop }}</td>
                  <td class="num">{{ pts(r.id) }}</td>
                </tr>
              }
            </tbody>
          </table>
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
}

function byPlace(a: Result, b: Result): number {
  if (a.place == null && b.place == null) return 0;
  if (a.place == null) return 1;
  if (b.place == null) return -1;
  return a.place - b.place;
}
