import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { DivisionService } from '../../core/division.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  id: number;
  code: string;
  name: string;
  lsc: string;
  swimmers: number;
  points: number;
  predicted: number;
  delta: number;
}

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ div.label() }} — Teams</h1>
    <p class="muted">{{ rows().length }} teams · points are the {{ div.label() }} competition. Predicted is from seed times.</p>
    <app-data-table [columns]="columns()" [rows]="rows()" [initialSort]="{ key: 'points', dir: 'desc' }" searchPlaceholder="Filter teams…" />
  `,
})
export class Teams {
  private data = inject(DataService);
  protected div = inject(DivisionService);

  columns = computed<Column<Row>[]>(() => [
    { key: 'code', header: 'Team', value: (r) => r.code, link: (r) => this.div.link('teams', r.id) },
    { key: 'name', header: 'Name', value: (r) => r.name },
    { key: 'swimmers', header: 'Swimmers', value: (r) => r.swimmers, numeric: true },
    { key: 'points', header: 'Points', value: (r) => r.points, numeric: true },
    { key: 'predicted', header: 'Predicted', value: (r) => r.predicted, numeric: true },
    { key: 'delta', header: 'Δ vs seed', value: (r) => r.delta, numeric: true },
  ]);

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const k = this.div.key();
    const byTeam = new Map(sb.teams.map((t) => [t.teamId, t]));
    const pred = new Map(sb.teamsPredicted.map((t) => [t.teamId, t]));
    const swimmers = this.data.swimmersByTeam();
    return d.teams.map((t) => {
      const pts = round(byTeam.get(t.id)?.[k]);
      const prd = round(pred.get(t.id)?.[k]);
      return {
        id: t.id,
        code: t.code,
        name: t.name ?? '',
        lsc: t.lsc ?? '',
        swimmers: swimmers.get(t.id)?.length ?? 0,
        points: pts,
        predicted: prd,
        delta: round(pts - prd),
      };
    });
  });
}

function round(n: number | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}
