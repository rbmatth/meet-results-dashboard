import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  rank: number;
  id: number;
  name: string;
  team: string;
  gender: string;
  age: number | null;
  points: number;
}

@Component({
  selector: 'app-high-scorers',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ div.label() }} — High Scorers</h1>
    <p class="muted">Individual-event points in the {{ div.label() }} competition (relays score to the team, not the swimmer).</p>
    <div class="filters">
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
    <app-data-table [columns]="columns()" [rows]="rows()" [initialSort]="{ key: 'points', dir: 'desc' }" searchPlaceholder="Search names…" />
  `,
})
export class HighScorers {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  team = signal('');
  gender = signal('');
  age = signal('');

  teams = computed(() => this.data.data()?.teams ?? []);
  ages = computed(() => [...new Set((this.data.data()?.swimmers ?? []).map((s) => s.age).filter((a): a is number => a != null))].sort((a, b) => a - b));

  columns = computed<Column<Row>[]>(() => [
    { key: 'rank', header: '#', value: (r) => r.rank, numeric: true },
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => this.div.link('swimmers', r.id) },
    { key: 'team', header: 'Team', value: (r) => r.team },
    { key: 'gender', header: 'G', value: (r) => r.gender, align: 'center' },
    { key: 'age', header: 'Age', value: (r) => r.age, numeric: true },
    { key: 'points', header: 'Points', value: (r) => r.points, numeric: true },
  ]);

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const k = this.div.key();
    const swById = this.data.swimmerById();
    const filtered = sb.swimmers
      .map((s) => ({ score: s, sw: swById.get(s.swimmerId) }))
      .filter(({ sw }) => sw &&
        (!this.team() || String(sw.team_id) === this.team()) &&
        (!this.gender() || sw.gender === this.gender()) &&
        (!this.age() || String(sw.age) === this.age()))
      .filter(({ score }) => score[k] > 0)
      .sort((a, b) => b.score[k] - a.score[k]);
    return filtered.map(({ score, sw }, i) => ({
      rank: i + 1,
      id: score.swimmerId,
      name: sw!.name,
      team: this.data.teamCode(sw!.team_id),
      gender: sw!.gender,
      age: sw!.age,
      points: round(score[k]),
    }));
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
