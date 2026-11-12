import type { MeetIndexEntry } from './models';

/**
 * Code of the most recent meet: latest start date, then latest end date, then code.
 * Independent of the order of index.json, which lists meets oldest first.
 */
export function newestMeetCode(index: readonly MeetIndexEntry[]): string | undefined {
  return [...index].sort(
    (a, b) =>
      b.start_date.localeCompare(a.start_date) ||
      b.end_date.localeCompare(a.end_date) ||
      b.code.localeCompare(a.code),
  )[0]?.code;
}
