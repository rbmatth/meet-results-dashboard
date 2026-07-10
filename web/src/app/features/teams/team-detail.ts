import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { DataTable, Column } from '../../shared/data-table';

interface GroupRow {
  key: string;
  gender: string;
  ageGroup: string;
  points: number;
}

interface TopScorerRow {
  id: number;
  rank: number;
  name: string;
  points: number;
}

interface RosterRow {
  id: number;
  name: string;
  age: number | null;
  gender: string;
}

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [RouterLink, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (team(); as t) {
      <a [routerLink]="div.link('teams')" class="muted">← Teams</a>
      <h1>{{ t.name || t.code }} <span class="muted" style="font-size:1rem">— {{ div.label() }}</span></h1>
      <span class="chip">{{ t.code }}</span>
      @if (t.lsc) { <span class="chip">LSC {{ t.lsc }}</span> }
      <div class="stats">
        <div class="stat"><div class="n">{{ r2(score()?.[div.key()]) }}</div><div class="l">{{ div.label() }} points</div></div>
        <div class="stat"><div class="n">{{ r2(predicted()) }}</div><div class="l">Predicted</div></div>
        <div class="stat"><div class="n" [class.pos]="delta() > 0" [class.neg]="delta() < 0">{{ signed(delta()) }}</div><div class="l">Δ vs seed</div></div>
        <div class="stat"><div class="n">{{ roster().length }}</div><div class="l">Swimmers</div></div>
      </div>

      <h2>Points by gender &amp; age group</h2>
      <app-data-table [columns]="groupColumns()" [rows]="groupRows()" searchPlaceholder="Filter groups…" />

      <h2>Top scorers</h2>
      <app-data-table [columns]="topScorerColumns()" [rows]="topScorerRows()" [initialSort]="{ key: 'rank', dir: 'asc' }" searchPlaceholder="Filter scorers…" />

      <h2>Roster ({{ roster().length }})</h2>
      <app-data-table [columns]="rosterColumns()" [rows]="rosterRows()" searchPlaceholder="Filter roster…" />
    } @else {
      <p class="muted">Team not found.</p>
    }
  `,
})
export class TeamDetail {
  private data = inject(DataService);
  protected div = inject(DivisionService);
  private route = inject(ActivatedRoute);
  private id = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('id')))), { initialValue: 0 });

  team = computed(() => this.data.team(this.id()));
  roster = computed(() => (this.data.swimmersByTeam().get(this.id()) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
  score = computed(() => this.data.scoreBook()?.teams.find((t) => t.teamId === this.id()));
  private pva = computed(() => this.data.scoreBook()?.predictedVsActual.find((t) => t.teamId === this.id()));
  predicted = computed(() => this.pva()?.predicted?.[this.div.key()] ?? 0);
  delta = computed(() => this.r2((this.score()?.[this.div.key()] ?? 0) - this.predicted()));

  groups = computed(() => {
    const k = this.div.key();
    return (this.data.scoreBook()?.groups ?? [])
      .filter((g) => g.teamId === this.id() && g[k] > 0)
      .map((g) => ({ key: `${g.gender}-${g.ageGroup}`, gender: g.gender === 'F' ? 'Girls' : 'Boys', ageGroup: g.ageGroup, points: this.r2(g[k]) }))
      .sort((a, b) => a.gender.localeCompare(b.gender) || a.ageGroup.localeCompare(b.ageGroup));
  });

  topScorers = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const k = this.div.key();
    return sb.swimmers
      .filter((s) => s.teamId === this.id() && s[k] > 0)
      .sort((a, b) => b[k] - a[k])
      .slice(0, 15)
      .map((s) => ({ id: s.swimmerId, name: this.data.swimmer(s.swimmerId)?.name ?? '', points: this.r2(s[k]) }));
  });

  r2(n: number | undefined | null): number {
    return Math.round((n ?? 0) * 100) / 100;
  }
  signed(n: number | undefined | null): string {
    const v = this.r2(n);
    return v > 0 ? `+${v}` : String(v);
  }

  groupRows = computed<GroupRow[]>(() => this.groups());

  topScorerRows = computed<TopScorerRow[]>(() =>
    this.topScorers().map((s, i) => ({
      id: s.id,
      rank: i + 1,
      name: s.name,
      points: s.points,
    }))
  );

  rosterRows = computed<RosterRow[]>(() =>
    this.roster().map((s) => ({
      id: s.id,
      name: s.name,
      age: s.age,
      gender: s.gender === 'F' ? 'Girls' : 'Boys',
    }))
  );

  groupColumns(): Column<GroupRow>[] {
    return [
      { key: 'gender', header: 'Gender', value: (g) => g.gender },
      { key: 'ageGroup', header: 'Age group', value: (g) => g.ageGroup },
      { key: 'points', header: 'Points', value: (g) => g.points, numeric: true, defaultDir: 'desc' },
    ];
  }

  topScorerColumns(): Column<TopScorerRow>[] {
    return [
      { key: 'rank', header: '#', value: (s) => s.rank, numeric: true },
      { key: 'name', header: 'Name', value: (s) => s.name, link: (s) => this.div.link('swimmers', s.id) },
      { key: 'points', header: 'Points', value: (s) => s.points, numeric: true, defaultDir: 'desc' },
    ];
  }

  rosterColumns(): Column<RosterRow>[] {
    return [
      { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => this.div.link('swimmers', r.id) },
      { key: 'age', header: 'Age', value: (r) => r.age ?? 0, numeric: true },
      { key: 'gender', header: 'Gender', value: (r) => r.gender },
    ];
  }
}
