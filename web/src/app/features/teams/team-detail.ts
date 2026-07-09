import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [RouterLink],
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
      <table class="plain">
        <thead><tr><th>Gender</th><th>Age group</th><th class="num">Points</th></tr></thead>
        <tbody>
          @for (g of groups(); track g.key) {
            <tr><td>{{ g.gender }}</td><td>{{ g.ageGroup }}</td><td class="num">{{ g.points }}</td></tr>
          } @empty { <tr><td colspan="3" class="muted">No points.</td></tr> }
        </tbody>
      </table>

      <h2>Top scorers</h2>
      <table class="plain">
        <thead><tr><th>#</th><th>Name</th><th class="num">Points</th></tr></thead>
        <tbody>
          @for (s of topScorers(); track s.id; let i = $index) {
            <tr><td class="num">{{ i + 1 }}</td><td><a [routerLink]="div.link('swimmers', s.id)">{{ s.name }}</a></td><td class="num">{{ s.points }}</td></tr>
          } @empty { <tr><td colspan="3" class="muted">No scorers.</td></tr> }
        </tbody>
      </table>

      <h2>Roster ({{ roster().length }})</h2>
      <table class="plain">
        <thead><tr><th>Name</th><th class="num">Age</th><th>Gender</th></tr></thead>
        <tbody>
          @for (s of roster(); track s.id) {
            <tr><td><a [routerLink]="div.link('swimmers', s.id)">{{ s.name }}</a></td><td class="num">{{ s.age }}</td><td>{{ s.gender === 'F' ? 'Girls' : 'Boys' }}</td></tr>
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
}
