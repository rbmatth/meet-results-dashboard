import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  id: number;
  name: string;
  team: string;
  gender: string;
  age: number | null;
  swims: number;
  champ: number;
  open: number;
}

@Component({
  selector: 'app-swimmers',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Swimmers</h1>
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
    <app-data-table [columns]="columns" [rows]="rows()" [initialSort]="{ key: 'champ', dir: 'desc' }" searchPlaceholder="Search names…" />
  `,
})
export class Swimmers {
  private data = inject(DataService);
  team = signal('');
  gender = signal('');

  teams = computed(() => this.data.data()?.teams ?? []);

  columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => ['/swimmers', r.id] },
    { key: 'team', header: 'Team', value: (r) => r.team },
    { key: 'gender', header: 'G', value: (r) => r.gender, align: 'center' },
    { key: 'age', header: 'Age', value: (r) => r.age, numeric: true },
    { key: 'swims', header: 'Swims', value: (r) => r.swims, numeric: true },
    { key: 'champ', header: 'Champ', value: (r) => r.champ, numeric: true },
    { key: 'open', header: 'Open', value: (r) => r.open, numeric: true },
  ];

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const scoreBySwimmer = new Map(sb.swimmers.map((s) => [s.swimmerId, s]));
    const swimCounts = this.data.resultsBySwimmer();
    const teamFilter = this.team();
    const genderFilter = this.gender();
    return d.swimmers
      .filter((s) => (!teamFilter || String(s.team_id) === teamFilter) && (!genderFilter || s.gender === genderFilter))
      .map((s) => {
        const sc = scoreBySwimmer.get(s.id);
        return {
          id: s.id,
          name: s.name,
          team: this.data.teamCode(s.team_id),
          gender: s.gender === 'F' ? 'F' : s.gender === 'M' ? 'M' : '',
          age: s.age,
          swims: swimCounts.get(s.id)?.length ?? 0,
          champ: round(sc?.champ),
          open: round(sc?.open),
        };
      });
  });
}

function round(n: number | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}
