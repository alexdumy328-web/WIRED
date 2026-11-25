import type { ServiceMode } from '../types.ts';
import { bucharestParts, bucharestWallToUTC, isHoliday } from './hours.ts';

export type Slot = {
  start: string; /* ISO UTC */
  label: string; /* "09:00" Bucharest wall time */
};

/**
 * Returns the next `count` bookable dates as 'YYYY-MM-DD' (Bucharest),
 * skipping Sundays and Romanian public holidays.
 * Starts tomorrow if today is past the last slot.
 */
export function daysAhead(
  from: Date,
  count: number,
  mode: ServiceMode
): string[] {
  if (count <= 0) return [];

  const p = bucharestParts(from);
  const todayStr = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;

  let startsTomorrow = false;
  if (p.weekday === 0 || isHoliday(todayStr)) {
    startsTomorrow = true;
  } else {
    const lastSlotHour =
      p.weekday === 6
        ? (mode === 'shop' ? 13 : 10)
        : (mode === 'shop' ? 17 : 15);
    const lastSlotInstant = bucharestWallToUTC(p.y, p.m, p.d, lastSlotHour, 0);
    if (from.getTime() >= lastSlotInstant.getTime()) {
      startsTomorrow = true;
    }
  }

  const results: string[] = [];
  let offset = startsTomorrow ? 1 : 0;

  while (results.length < count) {
    const target = new Date(Date.UTC(p.y, p.m - 1, p.d + offset, 12, 0));
    const y = target.getUTCFullYear();
    const m = target.getUTCMonth() + 1;
    const d = target.getUTCDate();
    const dayOfWeek = target.getUTCDay();
    const str = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    if (dayOfWeek !== 0 && !isHoliday(str)) {
      results.push(str);
    }
    offset++;
  }

  return results;
}

/**
 * Computes available booking slots for a given Bucharest date string 'YYYY-MM-DD'.
 * - shop = 60-minute slots from opening to one hour before closing (Mon–Fri 09..17, Sat 10..13)
 * - mobile = 2-hour windows starting 09, 11, 13, 15 Mon–Fri and 10 on Sat
 * Excludes slots starting less than 2 hours from `now`, and slots whose start ISO is in `taken`.
 */
export function slotsFor(
  day: string,
  mode: ServiceMode,
  now: Date,
  taken: string[] = []
): Slot[] {
  const parts = day.split('-').map((v) => parseInt(v, 10));
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) {
    return [];
  }
  const [y, m, d] = parts;

  // Determine Bucharest day of week at noon
  const testNoon = bucharestWallToUTC(y, m, d, 12, 0);
  const p = bucharestParts(testNoon);

  if (p.weekday === 0 || isHoliday(day)) {
    return [];
  }

  let startHours: number[] = [];
  if (mode === 'shop') {
    startHours =
      p.weekday === 6
        ? [10, 11, 12, 13]
        : [9, 10, 11, 12, 13, 14, 15, 16, 17];
  } else {
    startHours =
      p.weekday === 6
        ? [10]
        : [9, 11, 13, 15];
  }

  const takenSet = new Set(
    taken.map((t) => {
      try {
        return new Date(t).toISOString();
      } catch {
        return t;
      }
    })
  );

  const nowMs = now.getTime();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const slots: Slot[] = [];

  for (const hour of startHours) {
    const slotDate = bucharestWallToUTC(y, m, d, hour, 0);
    const startIso = slotDate.toISOString();

    // Exclude slots starting less than 2 hours from now
    if (slotDate.getTime() - nowMs < twoHoursMs) {
      continue;
    }

    // Exclude slots whose start ISO is in taken
    if (takenSet.has(startIso) || taken.includes(startIso)) {
      continue;
    }

    const label = `${String(hour).padStart(2, '0')}:00`;
    slots.push({ start: startIso, label });
  }

  return slots;
}
