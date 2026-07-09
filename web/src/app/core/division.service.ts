import { Injectable, computed, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Division, EventInfo } from './models';

// The active "meet" is a division (Championship or Open) taken from the first URL
// segment. Championship and Open are treated as separate, self-contained meets.
@Injectable({ providedIn: 'root' })
export class DivisionService {
  private router = inject(Router);

  readonly division = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.parse()),
    ),
    { requireSync: true },
  );

  /** Key into a DivisionPoints object. */
  readonly key = computed<'champ' | 'open'>(() => (this.division() === 'OPEN' ? 'open' : 'champ'));
  /** URL segment for the active division. */
  readonly seg = computed(() => segFor(this.division()));
  readonly label = computed(() => (this.division() === 'OPEN' ? 'Open' : 'Championship'));

  private parse(): Division {
    return this.router.url.split('/')[1] === 'open' ? 'OPEN' : 'CHAMP';
  }

  /** Absolute link within the current division, e.g. link('teams', 3). */
  link(...parts: (string | number)[]): (string | number)[] {
    return ['/', this.seg(), ...parts];
  }

  /** Link to an event under its own division (events belong to one division). */
  eventLink(ev: Pick<EventInfo, 'id' | 'division'> | undefined | null): (string | number)[] {
    const seg = ev ? segFor(ev.division) : this.seg();
    return ['/', seg, 'events', ev?.id ?? 0];
  }

  /** The same sub-path under the other division (for the header switch). */
  otherRoute(target: Division): (string | number)[] {
    const rest = this.router.url.split('/').slice(2).join('/').split('?')[0];
    return ['/', segFor(target), ...(rest ? rest.split('/') : ['scores'])];
  }
}

function segFor(d: Division): string {
  return d === 'OPEN' ? 'open' : 'championship';
}
