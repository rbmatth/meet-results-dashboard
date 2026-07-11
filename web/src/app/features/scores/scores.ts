import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ageGroupOptions } from '../../core/age-groups';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { decidingRound } from '../../core/scoring';
import { DataTable, DataTableCellDef, Column } from '../../shared/data-table';

interface StandingsRow {
  rank: number;
  teamId: number;
  code: string;
  points: number; // current actual points (completed events)
  pct: number;
  seedSoFar: number; // seed-based prediction for the completed events only
  projected: number; // projected final = actual completed + seed for remaining
  predicted: number; // original seed-based prediction across all events
  delta: number; // current - seedSoFar (over/under seed on what's been swum)
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
  imports: [DataTable, DataTableCellDef],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ div.label() }} - Team Standings</h1>
    <p class="muted">{{ div.label() }} competition only; relays score 2x individual. Current = points scored so far. Seed so far = what seed times predicted for those same completed events (vs seed = how the actual differs). Proj. final = current results plus a projection for events still to come (using prelim times where available, else seed times). Seed (full) = the original all-events seed prediction.</p>
    @if (scoredEventCount() < totalEventCount()) {
      <p class="banner">Partial results: {{ scoredEventCount() }} of {{ totalEventCount() }} listed events scored so far.</p>
    }

    <app-data-table [columns]="standingsColumns()" [rows]="standingsRows()" [initialSort]="rankSort()" searchPlaceholder="Search teams...">
      <ng-template dtCell="pct" let-row>
        <div class="bar-wrap" style="width: clamp(120px, 30vw, 320px)">
          <span class="bar" [style.width.%]="row.pct"></span>
        </div>
      </ng-template>
    </app-data-table>

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
  styles: [`
    .banner { padding: .5rem .8rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); color: var(--muted); font-size: .85rem; }
  `],
})
export class Scores {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  gGender = signal('F');
  gAge = signal('');

  ageGroups = computed(() => {
    // Scoped to the active division -- Open and Champ have different age-group
    // boundaries (e.g. Open alone has a 6-and-under bracket), so mixing them here
    // would leak the other division's groups into this one's dropdown.
    const events = (this.data.data()?.events ?? []).filter((e) => e.division === this.div.division());
    const groups = ageGroupOptions(events);
    if (groups.length && !this.gAge()) queueMicrotask(() => this.gAge.set(groups[0]));
    return groups;
  });

  standings = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const k = this.div.key();
    const actual = new Map(sb.teams.map((t) => [t.teamId, t]));
    const pred = new Map(sb.teamsPredicted.map((t) => [t.teamId, t]));
    const seedSoFar = new Map(sb.teamsPredictedThroughCompleted.map((t) => [t.teamId, t]));
    const projected = new Map(sb.teamsProjectedFinal.map((t) => [t.teamId, t]));
    // teamsProjectedFinal covers every team with any actual or predicted points, so it's
    // the widest set — a team may have a projection without having scored anything yet.
    const rows = sb.teamsProjectedFinal
      .map((pf) => {
        const teamId = pf.teamId;
        const points = actual.get(teamId)?.[k] ?? 0;
        const ssf = seedSoFar.get(teamId)?.[k] ?? 0;
        return {
          teamId,
          code: this.data.teamCode(teamId),
          points: r2(points),
          seedSoFar: r2(ssf),
          projected: r2(projected.get(teamId)?.[k] ?? 0),
          predicted: r2(pred.get(teamId)?.[k] ?? 0),
          delta: r2(points - ssf),
        };
      })
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

  // Events (in the active division) whose deciding round has placed results — i.e.
  // actually scored so far. (Events not yet in the scraped data at all can't be
  // counted, hence "listed".)
  scoredEventCount = computed(() => {
    const d = this.data.data();
    if (!d) return 0;
    const division = this.div.division();
    const evById = this.data.eventById();
    const decided = new Set<number>();
    for (const r of d.results) {
      const ev = evById.get(r.event_id);
      if (ev && ev.division === division && r.round_type === decidingRound(ev.division) && r.place != null) {
        decided.add(r.event_id);
      }
    }
    return decided.size;
  });
  totalEventCount = computed(
    () => (this.data.data()?.events ?? []).filter((e) => e.division === this.div.division()).length,
  );

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
      { key: 'points', header: 'Current', value: (r) => r.points, numeric: true, defaultDir: 'desc' },
      { key: 'pct', header: '', value: (r) => r.pct },
      { key: 'seedSoFar', header: 'Seed so far', value: (r) => r.seedSoFar, numeric: true, defaultDir: 'desc' },
      {
        key: 'delta', header: 'vs seed', value: (r) => r.delta, numeric: true, defaultDir: 'desc',
        display: (r) => this.signed(r.delta),
        cellClass: (r) => (r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : null),
      },
      { key: 'projected', header: 'Proj. final', value: (r) => r.projected, numeric: true, defaultDir: 'desc' },
      { key: 'predicted', header: 'Seed (full)', value: (r) => r.predicted, numeric: true, defaultDir: 'desc' },
    ];
  }

  groupStandingsColumns(): Column<GroupStandingsRow>[] {
    return [
      { key: 'rank', header: '#', value: (g) => g.rank, numeric: true },
      { key: 'code', header: 'Team', value: (g) => g.code, link: (g) => this.div.link('teams', g.teamId) },
      { key: 'points', header: 'Points', value: (g) => g.points, numeric: true, defaultDir: 'desc' },
    ];
  }

  topScorersColumns(): Column<TopScorerRow>[] {
    return [
      { key: 'rank', header: '#', value: (s) => s.rank, numeric: true },
      { key: 'name', header: 'Name', value: (s) => s.name, link: (s) => this.div.link('swimmers', s.id) },
      { key: 'team', header: 'Team', value: (s) => s.team },
      { key: 'points', header: 'Points', value: (s) => s.points, numeric: true, defaultDir: 'desc' },
    ];
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
