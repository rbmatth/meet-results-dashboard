import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Column, DataTable } from '../../shared/data-table';
import { formatCs, formatDropCs } from '../../core/format';

interface Row {
  id: number;
  name: string;
  team: string;
  gender: string;
  event: string;
  division: string;
  seedCs: number;
  timeCs: number;
  dropCs: number;
}

@Component({
  selector: 'app-improvements',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Time Improvements</h1>
    <p class="muted">Drop = seed time − achieved time. Negative (green) means faster than seed.</p>
    <div class="filters">
      <label>Team
        <select (change)="team.set($any($event.target).value)">
          <option value="">All</option>
          @for (t of teams(); track t.id) { <option [value]="t.id">{{ t.code }}</option> }
        </select>
      </label>
      <label>Gender
        <select (change)="gender.set($any($event.target).value)">
          <option value="">All</option><option value="F">Girls</option><option value="M">Boys</option>
        </select>
      </label>
    </div>
    <app-data-table [columns]="columns" [rows]="rows()" [initialSort]="{ key: 'dropCs', dir: 'desc' }" searchPlaceholder="Search names / events…" />
  `,
})
export class Improvements {
  private data = inject(DataService);
  team = signal('');
  gender = signal('');

  teams = computed(() => this.data.data()?.teams ?? []);

  columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => ['/swimmers', r.id] },
    { key: 'team', header: 'Team', value: (r) => r.team },
    { key: 'event', header: 'Event', value: (r) => r.event },
    { key: 'division', header: 'Div', value: (r) => r.division },
    { key: 'seedCs', header: 'Seed', value: (r) => r.seedCs, display: (r) => formatCs(r.seedCs), numeric: true },
    { key: 'timeCs', header: 'Time', value: (r) => r.timeCs, display: (r) => formatCs(r.timeCs), numeric: true },
    { key: 'dropCs', header: 'Drop', value: (r) => r.dropCs, display: (r) => formatDropCs(r.dropCs), numeric: true },
  ];

  rows = computed<Row[]>(() => {
    const sb = this.data.scoreBook();
    if (!sb) return [];
    const swById = this.data.swimmerById();
    return sb.improvements
      .map((im) => ({ im, sw: swById.get(im.swimmerId), ev: this.data.event(im.eventId) }))
      .filter(({ sw }) => sw &&
        (!this.team() || String(sw.team_id) === this.team()) &&
        (!this.gender() || sw.gender === this.gender()))
      .map(({ im, sw, ev }) => ({
        id: im.swimmerId,
        name: sw!.name,
        team: this.data.teamCode(sw!.team_id),
        gender: sw!.gender,
        event: ev ? ev.title.replace(/^Event\s+\d+\s+/, '') : String(im.eventId),
        division: ev?.division === 'OPEN' ? 'Open' : 'Champ',
        seedCs: im.seedCs,
        timeCs: im.timeCs,
        dropCs: im.dropCs,
      }));
  });
}
