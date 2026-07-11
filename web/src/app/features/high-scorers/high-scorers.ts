import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ageGroupFor, ageGroupOptions } from '../../core/age-groups';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { Column, DataTable } from '../../shared/data-table';

// A "high scorers" board is a leaderboard, not a full roster — cap both lists so a big
// meet doesn't dump hundreds of rows. Filters narrow below these caps anyway.
const MAX_INDIVIDUALS = 50;
const MAX_TEAM_DIVISIONS = 30;

interface Row {
  rank: number;
  id: number;
  name: string;
  team: string;
  gender: string;
  age: number | null;
  points: number;
}

interface TeamDivisionRow {
  rank: number;
  teamId: number;
  team: string;
  division: string; // e.g. "Girls 11-12"
  points: number;
}

@Component({
  selector: 'app-high-scorers',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ div.label() }} — High Scorers</h1>
    <p class="muted">Individual-event points in the {{ div.label() }} competition (relays score to the team, not the swimmer). Filters apply to both tables.</p>
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
      <label>Age group
        <select (change)="ageGroup.set($any($event.target).value)">
          <option value="">All</option>
          @for (a of ageGroups(); track a) { <option [value]="a">{{ a }}</option> }
        </select>
      </label>
    </div>

    <h2>Top individual scorers</h2>
    <app-data-table [columns]="columns()" [rows]="rows()" [initialSort]="{ key: 'points', dir: 'desc' }" searchPlaceholder="Search names…" />

    <h2>Top team divisions</h2>
    <p class="muted">Points a team scored within one gender + age group (individual and relay), e.g. FST Girls 11-12.</p>
    <app-data-table [columns]="teamDivisionColumns()" [rows]="teamDivisionRows()" [initialSort]="{ key: 'points', dir: 'desc' }" searchPlaceholder="Search teams…" />
  `,
})
export class HighScorers {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  team = signal('');
  gender = signal('');
  ageGroup = signal('');

  teams = computed(() => this.data.data()?.teams ?? []);
  private divisionEvents = computed(() =>
    (this.data.data()?.events ?? []).filter((e) => e.division === this.div.division()),
  );
  ageGroups = computed(() => ageGroupOptions(this.divisionEvents()));

  columns = computed<Column<Row>[]>(() => [
    { key: 'rank', header: '#', value: (r) => r.rank, numeric: true },
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => this.div.link('swimmers', r.id) },
    { key: 'team', header: 'Team', value: (r) => r.team },
    { key: 'gender', header: 'G', value: (r) => r.gender, align: 'center' },
    { key: 'age', header: 'Age', value: (r) => r.age, numeric: true },
    { key: 'points', header: 'Points', value: (r) => r.points, numeric: true, defaultDir: 'desc' },
  ]);

  teamDivisionColumns = computed<Column<TeamDivisionRow>[]>(() => [
    { key: 'rank', header: '#', value: (r) => r.rank, numeric: true },
    { key: 'team', header: 'Team', value: (r) => r.team, link: (r) => this.div.link('teams', r.teamId) },
    { key: 'division', header: 'Division', value: (r) => r.division },
    { key: 'points', header: 'Points', value: (r) => r.points, numeric: true, defaultDir: 'desc' },
  ]);

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const k = this.div.key();
    const swById = this.data.swimmerById();
    const events = this.divisionEvents();
    const filtered = sb.swimmers
      .map((s) => ({ score: s, sw: swById.get(s.swimmerId) }))
      .filter(({ sw }) => sw &&
        (!this.team() || String(sw.team_id) === this.team()) &&
        (!this.gender() || sw.gender === this.gender()) &&
        (!this.ageGroup() || ageGroupFor(sw.age, events) === this.ageGroup()))
      .filter(({ score }) => score[k] > 0)
      .sort((a, b) => b.score[k] - a.score[k])
      .slice(0, MAX_INDIVIDUALS);
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

  teamDivisionRows = computed<TeamDivisionRow[]>(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const k = this.div.key();
    return sb.groups
      .filter((g) =>
        g[k] > 0 &&
        (!this.team() || String(g.teamId) === this.team()) &&
        (!this.gender() || g.gender === this.gender()) &&
        (!this.ageGroup() || g.ageGroup === this.ageGroup()))
      .sort((a, b) => b[k] - a[k])
      .slice(0, MAX_TEAM_DIVISIONS)
      .map((g, i) => ({
        rank: i + 1,
        teamId: g.teamId,
        team: this.data.teamCode(g.teamId),
        division: `${genderLabel(g.gender)} ${g.ageGroup}`,
        points: round(g[k]),
      }));
  });
}

function genderLabel(g: string): string {
  return g === 'F' ? 'Girls' : g === 'M' ? 'Boys' : 'Mixed';
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
