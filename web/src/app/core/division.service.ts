import { Injectable, computed, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { DataService } from './data.service';
import { Division, EventInfo } from './models';

// The active context is a meet + a division (Championship or Open), both taken from the
// URL: /<meet>/<division>/<view>. Championship and Open are treated as separate,
// self-contained meets, and each scraped meet (2025CSA, 2026CSA) is separate too.
@Injectable({ providedIn: 'root' })
export class DivisionService {
  private router = inject(Router);
  private data = inject(DataService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url),
    ),
    { requireSync: true },
  );

  /** Meet code from the first URL segment (e.g. "2025CSA"). */
  readonly meet = computed(() => decodeURIComponent(this.url().split('?')[0].split('/')[1] ?? ''));
  /** Division from the second URL segment. */
  readonly division = computed<Division>(() => (this.url().split('/')[2] === 'open' ? 'OPEN' : 'CHAMP'));

  readonly key = computed<'champ' | 'open'>(() => (this.division() === 'OPEN' ? 'open' : 'champ'));
  readonly seg = computed(() => segFor(this.division()));
  readonly label = computed(() => (this.division() === 'OPEN' ? 'Open' : 'Championship'));

  readonly meets = computed(() => this.data.index());

  constructor() {
    // Load the meet named in the URL whenever it changes.
    effect(() => {
      const code = this.meet();
      if (code) void this.data.loadMeet(code);
    });
  }

  /** Absolute link within the current meet + division, e.g. link('teams', 3). */
  link(...parts: (string | number)[]): (string | number)[] {
    return ['/', this.meet(), this.seg(), ...parts];
  }

  /** Link to an event under its own division (events belong to one division). */
  eventLink(ev: Pick<EventInfo, 'id' | 'division'> | undefined | null): (string | number)[] {
    return ['/', this.meet(), ev ? segFor(ev.division) : this.seg(), 'events', ev?.id ?? 0];
  }

  /** The same view under the other division of the current meet (header toggle). */
  otherRoute(target: Division): (string | number)[] {
    return ['/', this.meet(), segFor(target), ...this.viewPath()];
  }

  /** Switch to another meet, keeping the current division + view (without detail ids,
   * which aren't portable across meets). */
  switchMeet(code: string): void {
    if (code && code !== this.meet()) {
      void this.router.navigate(['/', code, this.seg(), this.viewPath()[0]]);
    }
  }

  // The view path after /<meet>/<division> (e.g. ["high-scorers"]); defaults to ["scores"].
  private viewPath(): string[] {
    const rest = this.url().split('?')[0].split('/').slice(3).filter(Boolean);
    return rest.length ? rest : ['scores'];
  }
}

function segFor(d: Division): string {
  return d === 'OPEN' ? 'open' : 'championship';
}
