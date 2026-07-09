import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  id: number;
  code: string;
  lsc: string;
  swimmers: number;
  champ: number;
  open: number;
  combined: number;
  predicted: number;
}

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Teams</h1>
    <p class="muted">{{ rows().length }} teams · scored points are actual meet results; predicted is from seed times.</p>
    <app-data-table [columns]="columns" [rows]="rows()" [initialSort]="{ key: 'combined', dir: 'desc' }" searchPlaceholder="Filter teams…" />
  `,
})
export class Teams {
  private data = inject(DataService);

  columns: Column<Row>[] = [
    { key: 'code', header: 'Team', value: (r) => r.code, link: (r) => ['/teams', r.id] },
    { key: 'lsc', header: 'LSC', value: (r) => r.lsc },
    { key: 'swimmers', header: 'Swimmers', value: (r) => r.swimmers, numeric: true },
    { key: 'champ', header: 'Champ', value: (r) => r.champ, numeric: true },
    { key: 'open', header: 'Open', value: (r) => r.open, numeric: true },
    { key: 'combined', header: 'Total', value: (r) => r.combined, numeric: true },
    { key: 'predicted', header: 'Predicted', value: (r) => r.predicted, numeric: true },
  ];

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    const sb = this.data.scoreBook();
    if (!d || !sb) return [];
    const byTeam = new Map(sb.teams.map((t) => [t.teamId, t]));
    const pred = new Map(sb.teamsPredicted.map((t) => [t.teamId, t]));
    const swimmers = this.data.swimmersByTeam();
    return d.teams.map((t) => {
      const s = byTeam.get(t.id);
      return {
        id: t.id,
        code: t.code,
        lsc: t.lsc ?? '',
        swimmers: swimmers.get(t.id)?.length ?? 0,
        champ: round(s?.champ),
        open: round(s?.open),
        combined: round(s?.combined),
        predicted: round(pred.get(t.id)?.combined),
      };
    });
  });
}

function round(n: number | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}
