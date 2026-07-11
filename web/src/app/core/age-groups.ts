import { EventInfo } from './models';

// This league's meets pair each per-age-group relay with a same-stroke individual split
// (e.g. Champ: 13-14 and 15-19 both exist), but occasionally also carry one combined
// relay spanning both (Open events 149/150: a single "13-19" 200 Free Relay instead of
// separate 13-14 / 15-19 relays). It's a real event, but every individual age it could
// apply to already falls under 13-14 or 15-19, so it isn't useful as its own filter
// bucket -- excluded here, not from the events list itself.
const COMBINED_RELAY_AGE_GROUP = '13-19';

type AgeBucketSource = Pick<EventInfo, 'age_group' | 'min_age' | 'max_age'>;

interface AgeBucket {
  ageGroup: string;
  minAge: number | null;
  maxAge: number | null;
}

function buckets(events: AgeBucketSource[]): AgeBucket[] {
  const byGroup = new Map<string, AgeBucket>();
  for (const e of events) {
    if (e.age_group === COMBINED_RELAY_AGE_GROUP || byGroup.has(e.age_group)) continue;
    byGroup.set(e.age_group, { ageGroup: e.age_group, minAge: e.min_age, maxAge: e.max_age });
  }
  return [...byGroup.values()].sort((a, b) => (a.maxAge ?? Infinity) - (b.maxAge ?? Infinity));
}

/** Distinct age-group labels for a set of events (one division's worth), youngest first. */
export function ageGroupOptions(events: AgeBucketSource[]): string[] {
  return buckets(events).map((b) => b.ageGroup);
}

/** Which age-group bucket an age falls under, per the same event set. */
export function ageGroupFor(age: number | null, events: AgeBucketSource[]): string | null {
  if (age == null) return null;
  const b = buckets(events).find((b) => (b.minAge == null || age >= b.minAge) && (b.maxAge == null || age <= b.maxAge));
  return b?.ageGroup ?? null;
}
