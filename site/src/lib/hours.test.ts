import { describe, expect, it } from 'vitest';
import {
  bucharestParts,
  bucharestWallToUTC,
  closingTime,
  isOpenAt,
  nextOpening,
  ROMANIAN_HOLIDAYS,
} from './hours.ts';

describe('hours.ts', () => {
  it('computes Bucharest wall-clock parts correctly', () => {
    // 2026-06-08 is a Monday
    // 07:00 UTC is 10:00 in Bucharest (summer, UTC+3)
    const d = new Date('2026-06-08T07:30:00Z');
    const p = bucharestParts(d);
    expect(p).toEqual({
      y: 2026,
      m: 6,
      d: 8,
      hh: 10,
      mm: 30,
      weekday: 1, // Monday
    });
  });

  it('handles DST conversion correctly (summer 09:00 = 06:00Z, winter 09:00 = 07:00Z)', () => {
    const summerBucharest = bucharestWallToUTC(2026, 6, 15, 9, 0);
    expect(summerBucharest.toISOString()).toBe('2026-06-15T06:00:00.000Z');

    const winterBucharest = bucharestWallToUTC(2026, 1, 15, 9, 0);
    expect(winterBucharest.toISOString()).toBe('2026-01-15T07:00:00.000Z');
  });

  it('is closed on Romanian public holidays', () => {
    // 2026-01-01 (New Year)
    const newYear = bucharestWallToUTC(2026, 1, 1, 12, 0);
    expect(isOpenAt(newYear)).toBe(false);

    // 2026-04-10 (Orthodox Good Friday)
    const goodFriday = bucharestWallToUTC(2026, 4, 10, 11, 0);
    expect(isOpenAt(goodFriday)).toBe(false);

    // 2026-04-13 (Orthodox Easter Monday)
    const easterMonday = bucharestWallToUTC(2026, 4, 13, 11, 0);
    expect(isOpenAt(easterMonday)).toBe(false);

    // 2026-05-01 (Labour Day)
    const labourDay = bucharestWallToUTC(2026, 5, 1, 11, 0);
    expect(isOpenAt(labourDay)).toBe(false);

    // 2026-06-01 (Children's Day / Pentecost Monday)
    const juneFirst = bucharestWallToUTC(2026, 6, 1, 11, 0);
    expect(isOpenAt(juneFirst)).toBe(false);

    // 2027-04-30 (2027 Good Friday)
    const goodFriday2027 = bucharestWallToUTC(2027, 4, 30, 11, 0);
    expect(isOpenAt(goodFriday2027)).toBe(false);

    expect(ROMANIAN_HOLIDAYS).toContain('2026-01-01');
    expect(ROMANIAN_HOLIDAYS).toContain('2027-12-26');
  });

  it('is closed on Sundays', () => {
    // 2026-06-14 is a Sunday
    const sundayMorning = bucharestWallToUTC(2026, 6, 14, 11, 0);
    expect(bucharestParts(sundayMorning).weekday).toBe(0);
    expect(isOpenAt(sundayMorning)).toBe(false);
  });

  it('handles Saturday hours (10:00–14:00)', () => {
    // 2026-06-13 is a Saturday
    const satBeforeOpen = bucharestWallToUTC(2026, 6, 13, 9, 59);
    const satOpenAt10 = bucharestWallToUTC(2026, 6, 13, 10, 0);
    const satOpenAt12 = bucharestWallToUTC(2026, 6, 13, 12, 0);
    const satOpenAt1359 = bucharestWallToUTC(2026, 6, 13, 13, 59);
    const satClosedAt14 = bucharestWallToUTC(2026, 6, 13, 14, 0);
    const satClosedAt15 = bucharestWallToUTC(2026, 6, 13, 15, 0);

    expect(isOpenAt(satBeforeOpen)).toBe(false);
    expect(isOpenAt(satOpenAt10)).toBe(true);
    expect(isOpenAt(satOpenAt12)).toBe(true);
    expect(isOpenAt(satOpenAt1359)).toBe(true);
    expect(isOpenAt(satClosedAt14)).toBe(false);
    expect(isOpenAt(satClosedAt15)).toBe(false);

    // closingTime on Saturday
    expect(closingTime(satOpenAt10)?.toISOString()).toBe(
      satClosedAt14.toISOString()
    );
    expect(closingTime(satClosedAt14)).toBeNull();
  });

  it('handles Mon–Fri hours (09:00–18:00)', () => {
    // 2026-06-09 is a Tuesday
    const tueBeforeOpen = bucharestWallToUTC(2026, 6, 9, 8, 59);
    const tueOpenAt9 = bucharestWallToUTC(2026, 6, 9, 9, 0);
    const tueOpenAt17 = bucharestWallToUTC(2026, 6, 9, 17, 30);
    const tueClosedAt18 = bucharestWallToUTC(2026, 6, 9, 18, 0);

    expect(isOpenAt(tueBeforeOpen)).toBe(false);
    expect(isOpenAt(tueOpenAt9)).toBe(true);
    expect(isOpenAt(tueOpenAt17)).toBe(true);
    expect(isOpenAt(tueClosedAt18)).toBe(false);

    expect(closingTime(tueOpenAt9)?.toISOString()).toBe(
      tueClosedAt18.toISOString()
    );
    expect(closingTime(tueBeforeOpen)).toBeNull();
  });

  it('computes nextOpening correctly', () => {
    // If open now, returns given date
    const openNow = bucharestWallToUTC(2026, 6, 9, 11, 0);
    expect(nextOpening(openNow).getTime()).toBe(openNow.getTime());

    // Tuesday before open (07:00) -> opens today at 09:00
    const tueEarly = bucharestWallToUTC(2026, 6, 9, 7, 0);
    const tueExpected = bucharestWallToUTC(2026, 6, 9, 9, 0);
    expect(nextOpening(tueEarly).toISOString()).toBe(tueExpected.toISOString());

    // Tuesday after close (19:00) -> opens Wednesday at 09:00
    const tueLate = bucharestWallToUTC(2026, 6, 9, 19, 0);
    const wedExpected = bucharestWallToUTC(2026, 6, 10, 9, 0);
    expect(nextOpening(tueLate).toISOString()).toBe(wedExpected.toISOString());

    // Friday after close (19:00) -> opens Saturday at 10:00
    const friLate = bucharestWallToUTC(2026, 6, 12, 19, 0);
    const satExpected = bucharestWallToUTC(2026, 6, 13, 10, 0);
    expect(nextOpening(friLate).toISOString()).toBe(satExpected.toISOString());

    // Saturday after close (15:00) -> Sunday closed -> opens Monday at 09:00
    const satLate = bucharestWallToUTC(2026, 6, 13, 15, 0);
    const monExpected = bucharestWallToUTC(2026, 6, 15, 9, 0);
    expect(nextOpening(satLate).toISOString()).toBe(monExpected.toISOString());

    // During holiday (2026-01-01 Thursday) -> Jan 2 is also holiday (Friday) -> Jan 3 is Saturday (10:00)
    const jan1 = bucharestWallToUTC(2026, 1, 1, 11, 0);
    const jan3Expected = bucharestWallToUTC(2026, 1, 3, 10, 0);
    expect(nextOpening(jan1).toISOString()).toBe(jan3Expected.toISOString());
  });
});
