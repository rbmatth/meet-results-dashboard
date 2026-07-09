import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  rank: number;
  id: number;
  name: string;
  team: string;
  gender: string;
  age: number | null;
  champ: number;
  open: number;
  combined: number;
}

@Component({
  selector: 'app-high-scorers',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>High Scorers</h1>
    <p class="muted">Individual-event points (relays score to the team, not the swimmer).</p>
    <div class="filters">
      <label>Rank by
        <select (change)="metric.set($any($event.target).value)">
          <option value="combined">Combined</option>
          <option value="champ">Champ</option>
          <option value="open">Open</option>
        </select>
      </label>
      <label>Team
        <select (change)="team.set($any($event.target).value)">
          <option value="">All</option>
          @for (t of teams(); track t.id) { <option [value]="t.id">{{ t.code }}</option> }
        </select>
      </label>
      <label>Gender
        <select (change)="gender.set($any($event.target).value)">
          <option value="">All</option><option value="F">Girls</option><option value="M">Boys</option>
        </select>
      </label>
      <label>Age
        <select (change)="age.set($any($event.target).value)">
          <option value="">All</option>
          @for (a of ages(); track a) { <option [value]="a">{{ a }}</option> }
        </select>
      </label>
    </div>
    <app-data-table [columns]="columns()" [rows]="rows()" [initialSort]="{ key: metric(), dir: 'desc' }" searchPlaceholder="Search names…" />
  `,
})
export class HighScorers {
  private data = inject(DataService);
  metric = signal<'combined' | 'champ' | 'open'>('combined');
  team = signal('');
  gender = signal('');
  age = signal('');

  teams = computed(() => this.data.data()?.teams ?? []);
  ages = computed(() => [...new Set((this.data.data()?.swimmers ?? []).map((s) => s.age).filter((a): a is number => a != null))].sort((a, b) => a - b));

  columns = computed<Column<Row>[]>(() => [
    { key: 'rank', header: '#', value: (r) => r.rank, numeric: true },
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => ['/swimmers', r.id] },
    { key: 'team', header: 'Team', value: (r) => r.team },
    { key: 'gender', header: 'G', value: (r) => r.gender, align: 'center' },
    { key: 'age', header: 'Age', value: (r) => r.age, numeric: true },
    { key: 'champ', header: 'Champ', value: (r) => r.champ, numeric: true },
    { key: 'open', header: 'Open', value: (r) => r.open, numeric: true },
    { key: 'combined', header: 'Combined', value: (r) => r.combined, numeric: true },
  ]);

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const swById = this.data.swimmerById();
    const metric = this.metric();
    const filtered = sb.swimmers
      .map((s) => ({ score: s, sw: swById.get(s.swimmerId) }))
      .filter(({ sw }) => sw &&
        (!this.team() || String(sw.team_id) === this.team()) &&
        (!this.gender() || sw.gender === this.gender()) &&
        (!this.age() || String(sw.age) === this.age()))
      .filter(({ score }) => score.combined > 0)
      .sort((a, b) => b.score[metric] - a.score[metric]);
    return filtered.map(({ score, sw }, i) => ({
      rank: i + 1,
      id: score.swimmerId,
      name: sw!.name,
      team: this.data.teamCode(sw!.team_id),
      gender: sw!.gender,
      age: sw!.age,
      champ: round(score.champ),
      open: round(score.open),
      combined: round(score.combined),
    }));
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
