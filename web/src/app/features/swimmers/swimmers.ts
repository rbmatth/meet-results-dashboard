import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  id: number;
  name: string;
  team: string;
  gender: string;
  age: number | null;
  swims: number;
  points: number;
}

@Component({
  selector: 'app-swimmers',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ div.label() }} — Swimmers</h1>
    <p class="muted">{{ rows().length }} swimmers with a {{ div.label() }} swim.</p>
    <div class="filters">
      <label>Team
        <select (change)="team.set($any($event.target).value)">
          <option value="">All</option>
          @for (t of teams(); track t.id) { <option [value]="t.id">{{ t.code }}</option> }
        </select>
      </label>
      <label>Gender
        <select (change)="gender.set($any($event.target).value)">
          <option value="">All</option>
          <option value="F">Girls</option>
          <option value="M">Boys</option>
        </select>
      </label>
    </div>
    <app-data-table [columns]="columns()" [rows]="rows()" [initialSort]="{ key: 'points', dir: 'desc' }" searchPlaceholder="Search names…" />
  `,
})
export class Swimmers {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  team = signal('');
  gender = signal('');

  teams = computed(() => this.data.data()?.teams ?? []);

  columns = computed<Column<Row>[]>(() => [
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => this.div.link('swimmers', r.id) },
    { key: 'team', header: 'Team', value: (r) => r.team },
    { key: 'gender', header: 'G', value: (r) => r.gender, align: 'center' },
    { key: 'age', header: 'Age', value: (r) => r.age, numeric: true },
    { key: 'swims', header: 'Swims', value: (r) => r.swims, numeric: true, defaultDir: 'desc' },
    { key: 'points', header: 'Points', value: (r) => r.points, numeric: true, defaultDir: 'desc' },
  ]);

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const division = this.div.division();
    const k = this.div.key();
    const scoreBySwimmer = new Map(sb.swimmers.map((s) => [s.swimmerId, s]));
    const swimCounts = this.data.resultsBySwimmer();
    const divsBySwimmer = this.data.divisionsBySwimmer();
    const teamFilter = this.team();
    const genderFilter = this.gender();
    return d.swimmers
      .filter((s) => divsBySwimmer.get(s.id)?.has(division))
      .filter((s) => (!teamFilter || String(s.team_id) === teamFilter) && (!genderFilter || s.gender === genderFilter))
      .map((s) => {
        const swims = (swimCounts.get(s.id) ?? []).filter((r) => r.division === division).length;
        return {
          id: s.id,
          name: s.name,
          team: this.data.teamCode(s.team_id),
          gender: s.gender === 'F' ? 'F' : s.gender === 'M' ? 'M' : '',
          age: s.age,
          swims,
          points: round(scoreBySwimmer.get(s.id)?.[k]),
        };
      });
  });
}

function round(n: number | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}
