import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DivisionService } from '../core/division.service';
import { ChangedEvent, UpdatesService } from '../core/updates.service';

// Bell icon + dropdown panel showing what's new (new results) since the user's last
// visit to the currently loaded meet. Self-contained: injects its own services, same
// pattern as DataTable. Opening the panel snapshots the current diff *before* calling
// markSeen() — binding the panel directly to the live computed would make the list
// vanish mid-view, since markSeen() immediately clears the underlying diff.
@Component({
  selector: 'app-notifications-bell',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notif-wrap">
      <button
        type="button"
        class="notif-bell"
        (click)="toggle()"
        [attr.aria-label]="svc.newCount() > 0 ? 'Notifications, ' + svc.newCount() + ' new' : 'Notifications'"
        title="What's new"
      >
        🔔
        @if (svc.newCount() > 0) {
          <span class="notif-badge">{{ svc.newCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="notif-backdrop" (click)="close()"></div>
        <div class="notif-panel">
          <div class="notif-header">New since your last visit</div>
          @if (snapshot().length) {
            <ul class="notif-list">
              @for (c of snapshot(); track c.eventId) {
                <li>
                  <a [routerLink]="div.eventLink({ id: c.eventId, division: c.division })" (click)="close()">
                    <span class="notif-event">
                      <span class="chip" [class.champ]="c.division === 'CHAMP'" [class.open]="c.division === 'OPEN'">
                        {{ c.division === 'CHAMP' ? 'Champ' : 'Open' }}
                      </span>
                      Event {{ c.number }} — {{ c.title }}
                    </span>
                    <span class="notif-count">
                      {{ c.isNewEvent ? 'now has results' : c.newCount + ' new result' + (c.newCount === 1 ? '' : 's') }}
                    </span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <div class="notif-empty muted">Nothing new since your last visit.</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .notif-wrap { position: relative; }
    .notif-bell {
      position: relative; display: flex; align-items: center; justify-content: center;
      width: 2.1rem; height: 2.1rem; border-radius: 999px; border: 1px solid var(--border);
      background: var(--surface-2); color: var(--text); font-size: 1.05rem; cursor: pointer; line-height: 1;
    }
    .notif-bell:hover { border-color: var(--accent); }
    .notif-badge {
      position: absolute; top: -.3rem; right: -.3rem; min-width: 1.1rem; height: 1.1rem;
      padding: 0 .25rem; border-radius: 999px; background: var(--bad); color: #fff;
      font-size: .65rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
    }
    .notif-backdrop { position: fixed; inset: 0; z-index: 30; }
    .notif-panel {
      position: absolute; right: 0; top: calc(100% + .5rem); z-index: 31; width: min(360px, 90vw);
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .25); overflow: hidden;
    }
    .notif-header { padding: .7rem .9rem; font-weight: 650; font-size: .85rem; border-bottom: 1px solid var(--border); }
    .notif-list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
    .notif-list li + li { border-top: 1px solid var(--border-soft); }
    .notif-list a {
      display: flex; flex-direction: column; gap: .2rem; padding: .6rem .9rem; text-decoration: none; color: inherit;
    }
    .notif-list a:hover { background: var(--surface-2); }
    .notif-event { font-size: .85rem; display: flex; align-items: center; gap: .4rem; }
    .notif-count { font-size: .75rem; color: var(--accent); }
    .notif-empty { padding: 1rem .9rem; font-size: .85rem; }
  `],
})
export class NotificationsBell {
  protected readonly svc = inject(UpdatesService);
  protected readonly div = inject(DivisionService);

  protected readonly open = signal(false);
  protected readonly snapshot = signal<ChangedEvent[]>([]);

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.snapshot.set(this.svc.changedEvents());
    this.svc.markSeen();
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
