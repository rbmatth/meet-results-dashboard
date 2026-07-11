import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface PieSlice {
  label: string;
  value: number;
}

// The validated 8-hue categorical palette (see styles.scss --cat-N), assigned in
// fixed order and never cycled. Any slice past the 8th is rendered in neutral gray:
// callers fold the tail into a single "Other" slice, which reads as de-emphasized
// context rather than impersonating a 9th category.
const PALETTE = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'];
const OTHER_COLOR = '--muted';
const MAX_SLICES = PALETTE.length + 1; // 8 hues + one neutral "Other"
const RADIUS = 35; // donut centerline radius within a 100x100 viewBox
const STROKE = 26; // donut thickness -> outer 48, inner 22
const GAP = 2; // surface gap between adjacent slices, in path units
const CIRC = 2 * Math.PI * RADIUS;

interface Arc extends PieSlice {
  color: string;
  pct: number;
  dash: string;
  rotation: number;
}

// A donut/pie showing part-to-whole for up to 8 categories, as self-contained inline
// SVG (no chart library). Every slice is direct-labeled in the legend, which — with
// the 2px inter-slice gaps — provides the secondary encoding the palette needs so
// identity is never carried by color alone.
@Component({
  selector: 'app-pie-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <div class="pie-wrap">
        <svg class="pie" viewBox="0 0 100 100" role="img" aria-label="Point share by bracket">
          @for (a of arcs(); track a.label) {
            <circle
              cx="50" cy="50" [attr.r]="radius" fill="none"
              [attr.stroke]="a.color" [attr.stroke-width]="stroke"
              [attr.stroke-dasharray]="a.dash"
              [attr.transform]="'rotate(' + a.rotation + ' 50 50)'"
            >
              <title>{{ a.label }}: {{ a.value }} ({{ a.pct }}%)</title>
            </circle>
          }
          <text x="50" y="47" text-anchor="middle" class="pie-total">{{ round(total()) }}</text>
          <text x="50" y="57" text-anchor="middle" class="pie-total-l">points</text>
        </svg>
        <ul class="pie-legend">
          @for (a of arcs(); track a.label) {
            <li>
              <span class="sw" [style.background]="a.color"></span>
              <span class="lbl">{{ a.label }}</span>
              <span class="v mono">{{ round(a.value) }} · {{ a.pct }}%</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    .pie-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem; margin: .5rem 0 1rem; }
    .pie { width: 180px; height: 180px; flex: 0 0 auto; }
    .pie-total { fill: var(--text); font-size: 12px; font-weight: 700; }
    .pie-total-l { fill: var(--muted); font-size: 5px; text-transform: uppercase; letter-spacing: .08em; }
    .pie-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; min-width: 180px; }
    .pie-legend li { display: flex; align-items: center; gap: .5rem; font-size: .85rem; }
    .pie-legend .sw { width: .8rem; height: .8rem; border-radius: 3px; flex: 0 0 auto; }
    .pie-legend .lbl { flex: 1 1 auto; }
    .pie-legend .v { color: var(--muted); }
  `],
})
export class PieChart {
  readonly slices = input.required<PieSlice[]>();
  protected readonly radius = RADIUS;
  protected readonly stroke = STROKE;

  readonly total = computed(() => this.slices().reduce((s, x) => s + x.value, 0));

  readonly arcs = computed<Arc[]>(() => {
    const total = this.total();
    if (total <= 0) return [];
    let cumulative = 0;
    return this.slices().slice(0, MAX_SLICES).map((s, i) => {
      const frac = s.value / total;
      const len = frac * CIRC;
      const drawn = Math.max(len - GAP, 0); // leave a surface gap after each slice
      const rotation = -90 + (cumulative / total) * 360; // start at 12 o'clock
      cumulative += s.value;
      return {
        label: s.label,
        value: s.value,
        color: `var(${i < PALETTE.length ? PALETTE[i] : OTHER_COLOR})`,
        pct: Math.round(frac * 1000) / 10,
        dash: `${drawn} ${CIRC - drawn}`,
        rotation,
      };
    });
  });

  round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
