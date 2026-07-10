import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { DataTable, Column } from '../../shared/data-table';

interface StandingsRow {
  rank: number;
  teamId: number;
  code: string;
  points: number;
  pct: number;
  predicted: number;
  delta: number;
}

interface GroupStandingsRow {
  rank: number;
  teamId: number;
  code: string;
  points: number;
}

interface TopScorerRow {
  rank: number;
  id: number;
  name: string;
  team: string;
  points: number;
}

@Component({
  selector: 'app-scores',
  standalone: true,
  imports: [RouterLink, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ div.label() }} - Team Standings</h1>
    <p class="muted">Points are the {{ div.label() }} competition only; relays score 2x individual. Predicted ranks each event by seed time.</p>

    <app-data-table [columns]="standingsColumns()" [rows]="standingsRows()" [initialSort]="rankSort()" searchPlaceholder="Search teams..." />

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
    <app-data-table [columns]="groupStandingsColumns()" [rows]="groupStandingsRows()" [initialSort]="rankSort()" searchPlaceholder="Search teams..." />

    <h2>Top individual scorers</h2>
    <app-data-table [columns]="topScorersColumns()" [rows]="topScorersRows()" [initialSort]="rankSort()" searchPlaceholder="Search swimmers..." />
  `,
})
export class Scores {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  gGender = signal('F');
  gAge = signal('');

  ageGroups = computed(() => {
    const groups = [...new Set((this.data.data()?.events ?? []).map((e) => e.age_group))].sort();
    if (groups.length && !this.gAge()) queueMicrotask(() => this.gAge.set(groups[0]));
    return groups;
  });

  standings = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const k = this.div.key();
    const pred = new Map(sb.teamsPredicted.map((t) => [t.teamId, t]));
    const rows = sb.teams
      .map((t) => ({
        teamId: t.teamId,
        code: this.data.teamCode(t.teamId),
        points: r2(t[k]),
        predicted: r2(pred.get(t.teamId)?.[k] ?? 0),
        delta: r2(t[k] - (pred.get(t.teamId)?.[k] ?? 0)),
      }))
      .sort((a, b) => b.points - a.points);
    const max = Math.max(1, ...rows.map((r) => r.points));
    return rows.map((r) => ({ ...r, pct: (r.points / max) * 100 }));
  });

  groupStandings = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const k = this.div.key();
    return sb.groups
      .filter((g) => g.gender === this.gGender() && g.ageGroup === this.gAge())
      .map((g) => ({ teamId: g.teamId, code: this.data.teamCode(g.teamId), points: r2(g[k]) }))
      .filter((g) => g.points > 0)
      .sort((a, b) => b.points - a.points);
  });

  topScorers = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const k = this.div.key();
    return [...sb.swimmers]
      .filter((s) => s[k] > 0)
      .sort((a, b) => b[k] - a[k])
      .slice(0, 20)
      .map((s) => ({
        id: s.swimmerId,
        name: this.data.swimmer(s.swimmerId)?.name ?? '',
        team: this.data.teamCode(s.teamId),
        points: r2(s[k]),
      }));
  });

  signed(n: number): string {
    return n > 0 ? `+${n}` : String(n);
  }

  rankSort() {
    return { key: 'rank', dir: 'asc' as const };
  }

  standingsRows = computed<StandingsRow[]>(() =>
    this.standings().map((row, i) => ({
      rank: i + 1,
      ...row,
    }))
  );

  groupStandingsRows = computed<GroupStandingsRow[]>(() =>
    this.groupStandings().map((g, i) => ({
      rank: i + 1,
      teamId: g.teamId,
      code: g.code,
      points: g.points,
    }))
  );

  topScorersRows = computed<TopScorerRow[]>(() =>
    this.topScorers().map((s, i) => ({
      rank: i + 1,
      id: s.id,
      name: s.name,
      team: s.team,
      points: s.points,
    }))
  );

  standingsColumns(): Column<StandingsRow>[] {
    return [
      { key: 'rank', header: '#', value: (r) => r.rank, numeric: true },
      { key: 'code', header: 'Team', value: (r) => r.code, link: (r) => this.div.link('teams', r.teamId) },
      { key: 'points', header: 'Points', value: (r) => r.points, numeric: true },
      { key: 'pct', header: '', value: (r) => r.pct, display: (r) => '#'.repeat(Math.round(r.pct / 10)) },
      { key: 'predicted', header: 'Predicted', value: (r) => r.predicted, numeric: true },
      { key: 'delta', header: 'Delta vs seed', value: (r) => r.delta, display: (r) => this.signed(r.delta), numeric: true },
    ];
  }

  groupStandingsColumns(): Column<GroupStandingsRow>[] {
    return [
      { key: 'rank', header: '#', value: (g) => g.rank, numeric: true },
      { key: 'code', header: 'Team', value: (g) => g.code, link: (g) => this.div.link('teams', g.teamId) },
      { key: 'points', header: 'Points', value: (g) => g.points, numeric: true },
    ];
  }

  topScorersColumns(): Column<TopScorerRow>[] {
    return [
      { key: 'rank', header: '#', value: (s) => s.rank, numeric: true },
      { key: 'name', header: 'Name', value: (s) => s.name, link: (s) => this.div.link('swimmers', s.id) },
      { key: 'team', header: 'Team', value: (s) => s.team },
      { key: 'points', header: 'Points', value: (s) => s.points, numeric: true },
    ];
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
