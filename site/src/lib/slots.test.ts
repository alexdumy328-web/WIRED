import { describe, expect, it } from 'vitest';
import { bucharestWallToUTC } from './hours.ts';
import { daysAhead, slotsFor } from './slots.ts';

describe('slots.ts', () => {
  describe('slotsFor', () => {
    it('generates shop mode slots from 09:00 to 17:00 on weekdays with correct UTC ISO', () => {
      // 2026-06-09 is Tuesday (summer, UTC+3)
      // Reference now is previous evening
      const now = bucharestWallToUTC(2026, 6, 8, 20, 0);
      const slots = slotsFor('2026-06-09', 'shop', now);

      expect(slots).toHaveLength(9);
      expect(slots.map((s) => s.label)).toEqual([
        '09:00',
        '10:00',
        '11:00',
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
      // 09:00 Bucharest = 06:00Z in summer
      expect(slots[0].start).toBe('2026-06-09T06:00:00.000Z');
      // 17:00 Bucharest = 14:00Z in summer
      expect(slots[8].start).toBe('2026-06-09T14:00:00.000Z');
    });

    it('generates winter slots with UTC+2 offset', () => {
      // 2026-01-13 is Tuesday (winter, UTC+2)
      const now = bucharestWallToUTC(2026, 1, 12, 20, 0);
      const slots = slotsFor('2026-01-13', 'shop', now);

      expect(slots).toHaveLength(9);
      // 09:00 Bucharest = 07:00Z in winter
      expect(slots[0].start).toBe('2026-01-13T07:00:00.000Z');
    });

    it('generates shop mode slots from 10:00 to 13:00 on Saturdays', () => {
      // 2026-06-13 is Saturday
      const now = bucharestWallToUTC(2026, 6, 12, 20, 0);
      const slots = slotsFor('2026-06-13', 'shop', now);

      expect(slots.map((s) => s.label)).toEqual([
        '10:00',
        '11:00',
        '12:00',
        '13:00',
      ]);
    });

    it('generates mobile mode slots (2h windows)', () => {
      // Weekday mobile
      const nowWeekday = bucharestWallToUTC(2026, 6, 8, 20, 0);
      const weekdaySlots = slotsFor('2026-06-09', 'mobile', nowWeekday);
      expect(weekdaySlots.map((s) => s.label)).toEqual([
        '09:00',
        '11:00',
        '13:00',
        '15:00',
      ]);

      // Saturday mobile
      const nowSat = bucharestWallToUTC(2026, 6, 12, 20, 0);
      const satSlots = slotsFor('2026-06-13', 'mobile', nowSat);
      expect(satSlots.map((s) => s.label)).toEqual(['10:00']);
    });

    it('excludes slots starting less than 2 hours from now', () => {
      // Tuesday at 10:15 Bucharest wall time
      // 11:00 is only 45 min away (< 2h) -> excluded
      // 12:00 is 1h45m away (< 2h) -> excluded
      // 13:00 is 2h45m away (>= 2h) -> included
      const now = bucharestWallToUTC(2026, 6, 9, 10, 15);
      const slots = slotsFor('2026-06-09', 'shop', now);

      expect(slots.map((s) => s.label)).toEqual([
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
    });

    it('excludes taken slots', () => {
      const now = bucharestWallToUTC(2026, 6, 8, 20, 0);
      const takenIso = bucharestWallToUTC(2026, 6, 9, 11, 0).toISOString();
      const slots = slotsFor('2026-06-09', 'shop', now, [takenIso]);

      expect(slots.find((s) => s.label === '11:00')).toBeUndefined();
      expect(slots.find((s) => s.start === takenIso)).toBeUndefined();
      expect(slots).toHaveLength(8);
    });

    it('returns empty array for Sundays and public holidays', () => {
      const now = bucharestWallToUTC(2026, 6, 1, 6, 0);
      // Sunday
      expect(slotsFor('2026-06-14', 'shop', now)).toEqual([]);
      // Holiday (Children's day / Pentecost Monday)
      expect(slotsFor('2026-06-01', 'shop', now)).toEqual([]);
    });
  });

  describe('daysAhead', () => {
    it('skips Sundays and Romanian public holidays', () => {
      // 2026-04-09 is Thursday before Easter
      // 2026-04-10: Orthodox Good Friday (holiday, skip)
      // 2026-04-11: Saturday (bookable)
      // 2026-04-12: Easter Sunday (Sunday + holiday, skip)
      // 2026-04-13: Easter Monday (holiday, skip)
      // 2026-04-14: Tuesday (bookable)
      // 2026-04-15: Wednesday (bookable)
      const now = bucharestWallToUTC(2026, 4, 9, 10, 0);
      const days = daysAhead(now, 4, 'shop');
      expect(days).toEqual([
        '2026-04-09',
        '2026-04-11',
        '2026-04-14',
        '2026-04-15',
      ]);
    });

    it('starts today if today is before the last slot', () => {
      // Monday at 10:00 (last shop slot is 17:00)
      const now = bucharestWallToUTC(2026, 6, 8, 10, 0);
      const days = daysAhead(now, 3, 'shop');
      expect(days[0]).toBe('2026-06-08');
      expect(days).toEqual(['2026-06-08', '2026-06-09', '2026-06-10']);
    });

    it('starts tomorrow if today is past the last slot', () => {
      // Monday at 17:30 (past last shop slot 17:00)
      const nowShop = bucharestWallToUTC(2026, 6, 8, 17, 30);
      const daysShop = daysAhead(nowShop, 3, 'shop');
      expect(daysShop[0]).toBe('2026-06-09');
      expect(daysShop).toEqual(['2026-06-09', '2026-06-10', '2026-06-11']);

      // Monday at 15:30 (past last mobile slot 15:00)
      const nowMobile = bucharestWallToUTC(2026, 6, 8, 15, 30);
      const daysMobile = daysAhead(nowMobile, 3, 'mobile');
      expect(daysMobile[0]).toBe('2026-06-09');

      // Saturday at 13:30 (past last shop slot 13:00) -> skips Sunday -> starts Monday
      const nowSat = bucharestWallToUTC(2026, 6, 13, 13, 30);
      const daysSat = daysAhead(nowSat, 2, 'shop');
      expect(daysSat).toEqual(['2026-06-15', '2026-06-16']);
    });
  });
});
