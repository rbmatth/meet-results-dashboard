import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Column, DataTable } from '../../shared/data-table';

interface Row {
  id: number;
  number: number;
  title: string;
  gender: string;
  age: string;
  distance: number;
  stroke: string;
  division: string;
  type: string;
  entries: number;
}

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Events</h1>
    <div class="filters">
      <label>Gender
        <select (change)="gender.set($any($event.target).value)">
          <option value="">All</option><option value="F">Girls</option><option value="M">Boys</option>
        </select>
      </label>
      <label>Age group
        <select (change)="age.set($any($event.target).value)">
          <option value="">All</option>
          @for (a of ageGroups(); track a) { <option [value]="a">{{ a }}</option> }
        </select>
      </label>
      <label>Stroke
        <select (change)="stroke.set($any($event.target).value)">
          <option value="">All</option>
          @for (s of strokes(); track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
      <label>Division
        <select (change)="division.set($any($event.target).value)">
          <option value="">All</option><option value="CHAMP">Champ</option><option value="OPEN">Open</option>
        </select>
      </label>
    </div>
    <app-data-table [columns]="columns" [rows]="rows()" [initialSort]="{ key: 'number', dir: 'asc' }" searchPlaceholder="Search events…" />
  `,
})
export class Events {
  private data = inject(DataService);
  gender = signal('');
  age = signal('');
  stroke = signal('');
  division = signal('');

  ageGroups = computed(() => uniq((this.data.data()?.events ?? []).map((e) => e.age_group)));
  strokes = computed(() => uniq((this.data.data()?.events ?? []).map((e) => e.stroke)));

  columns: Column<Row>[] = [
    { key: 'number', header: '#', value: (r) => r.number, numeric: true, link: (r) => ['/events', r.id] },
    { key: 'title', header: 'Event', value: (r) => r.title, link: (r) => ['/events', r.id] },
    { key: 'gender', header: 'G', value: (r) => r.gender, align: 'center' },
    { key: 'age', header: 'Age', value: (r) => r.age },
    { key: 'distance', header: 'Dist', value: (r) => r.distance, numeric: true },
    { key: 'stroke', header: 'Stroke', value: (r) => r.stroke },
    { key: 'division', header: 'Div', value: (r) => r.division },
    { key: 'type', header: 'Type', value: (r) => r.type },
    { key: 'entries', header: 'Entries', value: (r) => r.entries, numeric: true },
  ];

  rows = computed<Row[]>(() => {
    const d = this.data.data();
    if (!d) return [];
    const byEvent = this.data.resultsByEvent();
    return d.events
      .filter((e) =>
        (!this.gender() || e.gender === this.gender()) &&
        (!this.age() || e.age_group === this.age()) &&
        (!this.stroke() || e.stroke === this.stroke()) &&
        (!this.division() || e.division === this.division()),
      )
      .map((e) => ({
        id: e.id,
        number: e.number,
        title: e.title.replace(/^Event\s+\d+\s+/, ''),
        gender: e.gender,
        age: e.age_group,
        distance: e.distance,
        stroke: e.stroke,
        division: e.division === 'CHAMP' ? 'Champ' : 'Open',
        type: e.is_relay ? 'Relay' : 'Ind',
        entries: byEvent.get(e.id)?.length ?? 0,
      }));
  });
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
