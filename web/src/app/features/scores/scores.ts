import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';

type Metric = 'combined' | 'champ' | 'open';

@Component({
  selector: 'app-scores',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Team Standings</h1>
    <p class="muted">Champ and Open are scored with independent point tables; relays score 2× individual. “Predicted” ranks each event by seed time.</p>

    <div class="tabs">
      @for (m of metrics; track m.key) {
        <button [class.active]="metric() === m.key" (click)="metric.set(m.key)">{{ m.label }}</button>
      }
    </div>

    <table class="plain">
      <thead><tr><th>#</th><th>Team</th><th class="num">Points</th><th></th><th class="num">Predicted</th><th class="num">Δ vs seed</th></tr></thead>
      <tbody>
        @for (row of standings(); track row.teamId; let i = $index) {
          <tr>
            <td class="num">{{ i + 1 }}</td>
            <td><a [routerLink]="['/teams', row.teamId]">{{ row.code }}</a></td>
            <td class="num">{{ row.points }}</td>
            <td style="width:40%"><div class="bar-wrap"><span class="bar" [style.width.%]="row.pct"></span></div></td>
            <td class="num">{{ row.predicted }}</td>
            <td class="num" [class.pos]="row.delta > 0" [class.neg]="row.delta < 0">{{ signed(row.delta) }}</td>
          </tr>
        }
      </tbody>
    </table>

    <h2>Standings within a division (gender &amp; age group)</h2>
    <div class="filters">
      <label>Gender
        <select (change)="gGender.set($any($event.target).value)">
          <option value="F">Girls</option><option value="M">Boys</option>
        </select>
      </label>
      <label>Age group
        <select (change)="gAge.set($any($event.target).value)">
          @for (a of ageGroups(); track a) { <option [value]="a">{{ a }}</option> }
        </select>
      </label>
    </div>
    <table class="plain">
      <thead><tr><th>#</th><th>Team</th><th class="num">Champ</th><th class="num">Open</th><th class="num">Total</th></tr></thead>
      <tbody>
        @for (g of groupStandings(); track g.teamId; let i = $index) {
          <tr><td class="num">{{ i + 1 }}</td><td><a [routerLink]="['/teams', g.teamId]">{{ g.code }}</a></td><td class="num">{{ g.champ }}</td><td class="num">{{ g.open }}</td><td class="num">{{ g.combined }}</td></tr>
        } @empty { <tr><td colspan="5" class="muted">No points in this division.</td></tr> }
      </tbody>
    </table>

    <h2>Top individual scorers</h2>
    <table class="plain">
      <thead><tr><th>#</th><th>Name</th><th>Team</th><th class="num">Champ</th><th class="num">Open</th><th class="num">Points</th></tr></thead>
      <tbody>
        @for (s of topScorers(); track s.id; let i = $index) {
          <tr><td class="num">{{ i + 1 }}</td><td><a [routerLink]="['/swimmers', s.id]">{{ s.name }}</a></td><td>{{ s.team }}</td><td class="num">{{ s.champ }}</td><td class="num">{{ s.open }}</td><td class="num">{{ s.combined }}</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class Scores {
  private data = inject(DataService);
  metric = signal<Metric>('combined');
  gGender = signal('F');
  gAge = signal('');

  metrics = [
    { key: 'combined' as const, label: 'Combined' },
    { key: 'champ' as const, label: 'Champ' },
    { key: 'open' as const, label: 'Open' },
  ];

  ageGroups = computed(() => {
    const groups = [...new Set((this.data.data()?.events ?? []).map((e) => e.age_group))].sort();
    if (groups.length && !this.gAge()) queueMicrotask(() => this.gAge.set(groups[0]));
    return groups;
  });

  standings = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const m = this.metric();
    const pred = new Map(sb.teamsPredicted.map((t) => [t.teamId, t]));
    const rows = sb.teams
      .map((t) => ({
        teamId: t.teamId,
        code: this.data.teamCode(t.teamId),
        points: r2(t[m]),
        predicted: r2(pred.get(t.teamId)?.[m] ?? 0),
        delta: r2(t[m] - (pred.get(t.teamId)?.[m] ?? 0)),
      }))
      .sort((a, b) => b.points - a.points);
    const max = Math.max(1, ...rows.map((r) => r.points));
    return rows.map((r) => ({ ...r, pct: (r.points / max) * 100 }));
  });

  groupStandings = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    return sb.groups
      .filter((g) => g.gender === this.gGender() && g.ageGroup === this.gAge())
      .map((g) => ({ teamId: g.teamId, code: this.data.teamCode(g.teamId), champ: r2(g.champ), open: r2(g.open), combined: r2(g.combined) }))
      .sort((a, b) => b.combined - a.combined);
  });

  topScorers = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    return sb.swimmers.slice(0, 20).map((s) => ({
      id: s.swimmerId,
      name: this.data.swimmer(s.swimmerId)?.name ?? '',
      team: this.data.teamCode(s.teamId),
      champ: r2(s.champ),
      open: r2(s.open),
      combined: r2(s.combined),
    }));
  });

  signed(n: number): string {
    return n > 0 ? `+${n}` : String(n);
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
