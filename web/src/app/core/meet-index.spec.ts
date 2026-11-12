import { newestMeetCode } from './meet-index';
import type { MeetIndexEntry } from './models';

function entry(code: string, start: string, end: string): MeetIndexEntry {
  return { code, name: `${code} meet`, start_date: start, end_date: end };
}

describe('newestMeetCode', () => {
  it('picks the meet with the latest start date when the index is oldest first', () => {
    const idx = [entry('2025CSA', '2025-07-10', '2025-07-12'), entry('2026CSA', '2026-07-09', '2026-07-11')];
    expect(newestMeetCode(idx)).toBe('2026CSA');
  });

  it('does not depend on the order of the index', () => {
    const idx = [entry('2026CSA', '2026-07-09', '2026-07-11'), entry('2025CSA', '2025-07-10', '2025-07-12')];
    expect(newestMeetCode(idx)).toBe('2026CSA');
  });

  it('breaks a start-date tie by end date, then by code', () => {
    const sameStart = [entry('AAA', '2026-07-09', '2026-07-10'), entry('BBB', '2026-07-09', '2026-07-11')];
    expect(newestMeetCode(sameStart)).toBe('BBB');
    const sameDates = [entry('2026A', '2026-07-09', '2026-07-11'), entry('2026B', '2026-07-09', '2026-07-11')];
    expect(newestMeetCode(sameDates)).toBe('2026B');
  });

  it('does not modify the index it is given', () => {
    const idx = [entry('2025CSA', '2025-07-10', '2025-07-12'), entry('2026CSA', '2026-07-09', '2026-07-11')];
    newestMeetCode(idx);
    expect(idx.map((m) => m.code)).toEqual(['2025CSA', '2026CSA']);
  });

  it('returns undefined for an empty index', () => {
    expect(newestMeetCode([])).toBeUndefined();
  });
});
