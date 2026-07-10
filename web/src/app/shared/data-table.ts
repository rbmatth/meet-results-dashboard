import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface Column<T = any> {
  key: string;
  header: string;
  /** Value used for sorting and text filtering. */
  value: (row: T) => string | number | null;
  /** Optional display string (defaults to value). */
  display?: (row: T) => string;
  /** Optional routerLink target for the cell. */
  link?: (row: T) => (string | number)[] | null;
  /** Optional extra CSS class(es) for the cell, e.g. pos/neg coloring. */
  cellClass?: (row: T) => string | null;
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Direction applied the first time this column is sorted by (default 'asc'). */
  defaultDir?: 'asc' | 'desc';
}

// Custom cell renderer for one column, matched by column key:
//   <app-data-table ...>
//     <ng-template dtCell="pct" let-row> ...custom HTML for row... </ng-template>
//   </app-data-table>
@Directive({ selector: 'ng-template[dtCell]', standalone: true })
export class DataTableCellDef {
  readonly dtCell = input.required<string>();
  readonly template = inject(TemplateRef);
}

// Generic sortable + text-filterable table driven by column definitions.
@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dt-toolbar">
      <input
        class="dt-search"
        type="search"
        [placeholder]="searchPlaceholder()"
        (input)="query.set($any($event.target).value)"
      />
      <span class="dt-count">{{ view().length }} / {{ rows().length }}</span>
    </div>
    <div class="dt-scroll">
      <table class="dt">
        <thead>
          <tr>
            @for (col of columns(); track col.key) {
              <th
                [class.num]="col.numeric || col.align === 'right'"
                [class.center]="col.align === 'center'"
                (click)="toggleSort(col.key)"
              >
                {{ col.header }}
                @if (sortKey() === col.key) {
                  <span class="arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of view(); track $index) {
            <tr>
              @for (col of columns(); track col.key) {
                <td
                  [class.num]="col.numeric || col.align === 'right'"
                  [class.center]="col.align === 'center'"
                  [class]="col.cellClass?.(row)"
                >
                  @if (cellTpl(col.key); as tpl) {
                    <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                  } @else if (col.link && col.link(row)) {
                    <a [routerLink]="col.link(row)">{{ cell(col, row) }}</a>
                  } @else {
                    {{ cell(col, row) }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr><td class="empty" [attr.colspan]="columns().length">No rows</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .dt-toolbar { display: flex; align-items: center; gap: .75rem; margin-bottom: .5rem; }
    .dt-search { flex: 0 1 260px; padding: .45rem .6rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: inherit; }
    .dt-count { color: var(--muted); font-size: .8rem; }
    .dt-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
    table.dt { width: 100%; border-collapse: collapse; font-size: .875rem; }
    .dt thead th { position: sticky; top: 0; background: var(--surface-2); text-align: left; padding: .55rem .7rem; cursor: pointer; white-space: nowrap; user-select: none; border-bottom: 1px solid var(--border); font-weight: 600; }
    .dt thead th:hover { color: var(--accent); }
    .dt td { padding: .45rem .7rem; border-bottom: 1px solid var(--border-soft); white-space: nowrap; }
    .dt tbody tr:hover { background: var(--surface-2); }
    .dt .num { text-align: right; font-variant-numeric: tabular-nums; }
    .dt .center { text-align: center; }
    .dt a { color: var(--accent); text-decoration: none; }
    .dt a:hover { text-decoration: underline; }
    .arrow { font-size: .6rem; color: var(--accent); margin-left: .2rem; }
    .empty { text-align: center; color: var(--muted); padding: 1.2rem; }
  `],
})
export class DataTable<T = any> {
  readonly columns = input.required<Column<T>[]>();
  readonly rows = input.required<T[]>();
  readonly initialSort = input<{ key: string; dir: 'asc' | 'desc' }>();
  readonly searchPlaceholder = input('Filter…');

  private readonly cellDefs = contentChildren(DataTableCellDef);
  private readonly cellTplByKey = computed(
    () => new Map(this.cellDefs().map((d) => [d.dtCell(), d.template])),
  );
  cellTpl(key: string): TemplateRef<unknown> | undefined {
    return this.cellTplByKey().get(key);
  }

  readonly query = signal('');
  readonly sortKey = signal<string>('');
  readonly sortDir = signal<'asc' | 'desc'>('asc');

  private readonly effectiveSort = computed(() => {
    const k = this.sortKey();
    if (k) return { key: k, dir: this.sortDir() };
    const init = this.initialSort();
    return init ?? { key: this.columns()[0]?.key ?? '', dir: 'asc' as const };
  });

  readonly view = computed<T[]>(() => {
    const cols = this.columns();
    const q = this.query().trim().toLowerCase();
    let rows = this.rows();
    if (q) {
      rows = rows.filter((r) =>
        cols.some((c) => String(c.value(r) ?? '').toLowerCase().includes(q)),
      );
    }
    const { key, dir } = this.effectiveSort();
    const col = cols.find((c) => c.key === key);
    if (col) {
      const mul = dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const va = col.value(a);
        const vb = col.value(b);
        // Missing values (DQ/NS/unswum, etc.) always sort last, independent of direction.
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return mul * compare(va, vb);
      });
    }
    return rows;
  });

  cell(col: Column<T>, row: T): string {
    if (col.display) return col.display(row);
    const v = col.value(row);
    return v == null ? '' : String(v);
  }

  toggleSort(key: string): void {
    if (this.effectiveSort().key === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      const col = this.columns().find((c) => c.key === key);
      this.sortKey.set(key);
      this.sortDir.set(col?.defaultDir ?? 'asc');
    }
  }
}

// Compares two non-null values; null handling (always-last) happens in the caller.
function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
