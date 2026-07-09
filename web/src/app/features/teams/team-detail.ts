import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (team(); as t) {
      <a routerLink="/teams" class="muted">← Teams</a>
      <h1>{{ t.code }}</h1>
      @if (t.lsc) { <span class="chip">LSC {{ t.lsc }}</span> }
      <div class="stats">
        <div class="stat"><div class="n">{{ r2(score()?.champ) }}</div><div class="l">Champ points</div></div>
        <div class="stat"><div class="n">{{ r2(score()?.open) }}</div><div class="l">Open points</div></div>
        <div class="stat"><div class="n">{{ roster().length }}</div><div class="l">Swimmers</div></div>
      </div>

      <h2>Predicted vs actual (by division)</h2>
      <table class="plain">
        <thead><tr><th>Division</th><th class="num">Predicted</th><th class="num">Actual</th><th class="num">Δ vs seed</th></tr></thead>
        <tbody>
          <tr><td>Championship</td><td class="num">{{ r2(pva()?.predicted?.champ) }}</td><td class="num">{{ r2(pva()?.actual?.champ) }}</td><td class="num" [class.pos]="(pva()?.deltaChamp ?? 0) > 0" [class.neg]="(pva()?.deltaChamp ?? 0) < 0">{{ signed(pva()?.deltaChamp) }}</td></tr>
          <tr><td>Open</td><td class="num">{{ r2(pva()?.predicted?.open) }}</td><td class="num">{{ r2(pva()?.actual?.open) }}</td><td class="num" [class.pos]="(pva()?.deltaOpen ?? 0) > 0" [class.neg]="(pva()?.deltaOpen ?? 0) < 0">{{ signed(pva()?.deltaOpen) }}</td></tr>
        </tbody>
      </table>

      <h2>Points by gender & age group</h2>
      <table class="plain">
        <thead><tr><th>Gender</th><th>Age group</th><th class="num">Champ</th><th class="num">Open</th></tr></thead>
        <tbody>
          @for (g of groups(); track g.key) {
            <tr><td>{{ g.gender }}</td><td>{{ g.ageGroup }}</td><td class="num">{{ r2(g.champ) }}</td><td class="num">{{ r2(g.open) }}</td></tr>
          } @empty { <tr><td colspan="4" class="muted">No points.</td></tr> }
        </tbody>
      </table>

      <h2>Top scorers</h2>
      <table class="plain">
        <thead><tr><th>#</th><th>Name</th><th class="num">Champ</th><th class="num">Open</th></tr></thead>
        <tbody>
          @for (s of topScorers(); track s.id; let i = $index) {
            <tr><td class="num">{{ i + 1 }}</td><td><a [routerLink]="['/swimmers', s.id]">{{ s.name }}</a></td><td class="num">{{ r2(s.champ) }}</td><td class="num">{{ r2(s.open) }}</td></tr>
          } @empty { <tr><td colspan="4" class="muted">No scorers.</td></tr> }
        </tbody>
      </table>

      <h2>Roster ({{ roster().length }})</h2>
      <table class="plain">
        <thead><tr><th>Name</th><th class="num">Age</th><th>Gender</th></tr></thead>
        <tbody>
          @for (s of roster(); track s.id) {
            <tr><td><a [routerLink]="['/swimmers', s.id]">{{ s.name }}</a></td><td class="num">{{ s.age }}</td><td>{{ s.gender === 'F' ? 'Girls' : 'Boys' }}</td></tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="muted">Team not found.</p>
    }
  `,
})
export class TeamDetail {
  private data = inject(DataService);
  private route = inject(ActivatedRoute);
  private id = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('id')))), { initialValue: 0 });

  team = computed(() => this.data.team(this.id()));
  roster = computed(() => (this.data.swimmersByTeam().get(this.id()) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
  score = computed(() => this.data.scoreBook()?.teams.find((t) => t.teamId === this.id()));
  pva = computed(() => this.data.scoreBook()?.predictedVsActual.find((t) => t.teamId === this.id()));

  groups = computed(() =>
    (this.data.scoreBook()?.groups ?? [])
      .filter((g) => g.teamId === this.id())
      .map((g) => ({ ...g, key: `${g.gender}-${g.ageGroup}`, gender: g.gender === 'F' ? 'Girls' : 'Boys' }))
      .sort((a, b) => a.gender.localeCompare(b.gender) || a.ageGroup.localeCompare(b.ageGroup)),
  );

  topScorers = computed(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    return sb.swimmers
      .filter((s) => s.teamId === this.id())
      .slice(0, 15)
      .map((s) => ({ ...s, id: s.swimmerId, name: this.data.swimmer(s.swimmerId)?.name ?? '' }));
  });

  r2(n: number | undefined | null): number {
    return Math.round((n ?? 0) * 100) / 100;
  }
  signed(n: number | undefined | null): string {
    const v = this.r2(n);
    return v > 0 ? `+${v}` : String(v);
  }
}
