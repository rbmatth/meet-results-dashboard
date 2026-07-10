import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Column, DataTable } from './data-table';

interface Row {
  name: string;
  time: number | null;
  points: number;
}

const rows: Row[] = [
  { name: 'Fast', time: 3250, points: 10 },
  { name: 'Slow', time: 4510, points: 20 },
  { name: 'Mid', time: 3800, points: 15 },
  { name: 'DQd', time: null, points: 0 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'time', header: 'Time', value: (r) => r.time, numeric: true },
  { key: 'points', header: 'Points', value: (r) => r.points, numeric: true, defaultDir: 'desc' },
];

function createTable() {
  TestBed.configureTestingModule({ imports: [DataTable], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(DataTable<Row>);
  fixture.componentRef.setInput('columns', columns);
  fixture.componentRef.setInput('rows', rows);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('DataTable sorting', () => {
  it('defaults a plain column to ascending on first click', () => {
    const dt = createTable();
    dt.toggleSort('time');
    expect(dt.view().map((r) => r.name)).toEqual(['Fast', 'Mid', 'Slow', 'DQd']);
  });

  it("uses the column's defaultDir on first click", () => {
    const dt = createTable();
    dt.toggleSort('points');
    expect(dt.view().map((r) => r.name)).toEqual(['Slow', 'Mid', 'Fast', 'DQd']);
  });

  it('reverses direction on a second click of the same column', () => {
    const dt = createTable();
    dt.toggleSort('time');
    dt.toggleSort('time');
    expect(dt.view().map((r) => r.name)).toEqual(['Slow', 'Mid', 'Fast', 'DQd']);
  });

  it('always sorts null values last, regardless of direction', () => {
    const dt = createTable();
    dt.toggleSort('time');
    expect(dt.view().at(-1)!.name).toBe('DQd');
    dt.toggleSort('time'); // now descending
    expect(dt.view().at(-1)!.name).toBe('DQd');
  });
});
