import { describe, expect, it } from 'vitest';
import type { Job } from '../types.ts';
import { estimate, formatEta, formatLei } from './estimate.ts';

describe('estimate.ts', () => {
  describe('estimate', () => {
    it('returns zeros when jobs array is empty', () => {
      const res = estimate([], false);
      expect(res).toEqual({
        priceFrom: 0,
        priceTo: 0,
        etaHours: [0, 0],
        needsDiagnosis: false,
        partsExtra: false,
      });

      const resWithCustom = estimate([], true);
      expect(resWithCustom).toEqual({
        priceFrom: 0,
        priceTo: 0,
        etaHours: [0, 0],
        needsDiagnosis: true,
        partsExtra: false,
      });
    });

    it('sums prices and takes max ETA for shop jobs (parallel work)', () => {
      const jobs: Job[] = [
        {
          id: 'clean',
          category: 'laptop',
          mode: 'shop',
          name: { ro: 'Curățare', en: 'Cleaning' },
          description: { ro: 'Curățare', en: 'Cleaning' },
          priceFrom: 150,
          priceTo: 200,
          etaHours: [2, 4],
        },
        {
          id: 'screen',
          category: 'laptop',
          mode: 'shop',
          name: { ro: 'Ecran', en: 'Screen' },
          description: { ro: 'Schimb ecran', en: 'Screen replacement' },
          priceFrom: 300,
          // priceTo omitted, should default to priceFrom
          etaHours: [1, 6],
        },
      ];

      const res = estimate(jobs, false);
      expect(res.priceFrom).toBe(450); // 150 + 300
      expect(res.priceTo).toBe(500); // 200 + 300
      expect(res.etaHours).toEqual([2, 6]); // max(2, 1), max(4, 6)
      expect(res.needsDiagnosis).toBe(false);
    });

    it('sums durations for mobile jobs', () => {
      const jobs: Job[] = [
        {
          id: 'diag-car',
          category: 'auto',
          mode: 'mobile',
          name: { ro: 'Diag', en: 'Diag' },
          description: { ro: 'Diag', en: 'Diag' },
          priceFrom: 200,
          priceTo: 350,
          etaHours: [1, 2],
        },
        {
          id: 'wiring',
          category: 'auto',
          mode: 'mobile',
          name: { ro: 'Cablaj', en: 'Wiring' },
          description: { ro: 'Cablaj', en: 'Wiring' },
          priceFrom: 400,
          etaHours: [2, 3],
        },
      ];

      const res = estimate(jobs, false);
      expect(res.priceFrom).toBe(600);
      expect(res.priceTo).toBe(750);
      expect(res.etaHours).toEqual([3, 5]); // 1+2, 2+3
    });

    it('flags needsDiagnosis when hasCustom is true or any job requires diagnosis', () => {
      const regularJob: Job = {
        id: 'job-1',
        category: 'pc',
        mode: 'shop',
        name: { ro: 'J1', en: 'J1' },
        description: { ro: 'D1', en: 'D1' },
        priceFrom: 100,
        etaHours: [1, 2],
      };

      const diagnosisJob: Job = {
        id: 'job-2',
        category: 'board',
        mode: 'shop',
        name: { ro: 'J2', en: 'J2' },
        description: { ro: 'D2', en: 'D2' },
        priceFrom: 200,
        etaHours: [3, 8],
        needsDiagnosis: true,
      };

      expect(estimate([regularJob], false).needsDiagnosis).toBe(false);
      expect(estimate([regularJob], true).needsDiagnosis).toBe(true);
      expect(estimate([regularJob, diagnosisJob], false).needsDiagnosis).toBe(
        true
      );
    });
  });

  describe('formatEta', () => {
    it('formats under 24 hours using en dash and h suffix', () => {
      expect(formatEta([2, 4], 'ro')).toBe('2–4 h');
      expect(formatEta([2, 4], 'en')).toBe('2–4 h');
      expect(formatEta([3, 3], 'ro')).toBe('3 h');
      expect(formatEta([3, 3], 'en')).toBe('3 h');
    });

    it('formats 24 hours or more with days rounded up and en dash', () => {
      // 40h -> 2 days, 110h -> 5 days
      expect(formatEta([40, 110], 'ro')).toBe('2–5 zile');
      expect(formatEta([40, 110], 'en')).toBe('2–5 days');

      // 48h -> 2 days (min == max)
      expect(formatEta([48, 48], 'ro')).toBe('2 zile');
      expect(formatEta([48, 48], 'en')).toBe('2 days');
    });

    it('formats single day correctly', () => {
      expect(formatEta([24, 24], 'ro')).toBe('1 zi');
      expect(formatEta([24, 24], 'en')).toBe('1 day');

      expect(formatEta([12, 24], 'ro')).toBe('1 zi');
      expect(formatEta([12, 24], 'en')).toBe('1 day');
    });
  });

  describe('formatLei', () => {
    it('formats numbers in Romanian with dot separator', () => {
      expect(formatLei(1250, 'ro')).toBe('1.250 lei');
      expect(formatLei(1250000, 'ro')).toBe('1.250.000 lei');
      expect(formatLei(350, 'ro')).toBe('350 lei');
      expect(formatLei(0, 'ro')).toBe('0 lei');
    });

    it('formats numbers in English with comma separator', () => {
      expect(formatLei(1250, 'en')).toBe('1,250 lei');
      expect(formatLei(1250000, 'en')).toBe('1,250,000 lei');
      expect(formatLei(350, 'en')).toBe('350 lei');
      expect(formatLei(0, 'en')).toBe('0 lei');
    });
  });
});

import { jobPrice } from './estimate.ts'
import { labourPrice } from './pricing.ts'

describe('hourly pricing', () => {
  const base: Job = { id: 'x', category: 'board', mode: 'shop', name: { ro: '', en: '' }, description: { ro: '', en: '' }, priceFrom: 0, etaHours: [1, 2] }
  it('micro work is always 250 lei/h, consumables on top', () => {
    const job = { ...base, hourly: { hours: [1, 2] as [number, number], fineness: 'micro' as const, consumables: 'high' as const } }
    expect(jobPrice(job)).toEqual([340, 680]) // 1×250×1.35, 2×250×1.35, rounded to 10
  })
  it('value tier sets the rate for byValue jobs', () => {
    const job = { ...base, hourly: { hours: [1, 3] as [number, number], fineness: 'standard' as const, consumables: 'medium' as const, byValue: true } }
    expect(jobPrice(job, 'low')).toEqual(labourPrice([1, 3], 'standard', 'medium', 'low'))
    expect(jobPrice(job, 'low')).toEqual([120, 360])
    expect(jobPrice(job)).toEqual([120, 900]) // unknown value: 100–250 lei/h
  })
  it('fine work never drops below 150 lei/h', () => {
    expect(labourPrice([1, 1], 'fine', 'low', 'low')).toEqual([170, 170])
  })
})

import { quotePickup, PICKUP_DEFAULTS } from './pickup.ts'

describe('pickup pricing', () => {
  it('prices fuel and driver time per trip, both ways', () => {
    // 10 km one way, 20 min: trip = 20 km. Fuel 20×7.5×7.6/100 = 11.4. Time (40+10)/60×25 = 20.8. Per trip 32.2 → 30 (step 5).
    const q = quotePickup(10, 20, 'both', true)
    expect(q.perTripLei).toBe(30)
    expect(q.totalLei).toBe(60)
    expect(q.totalKm).toBe(40)
  })
  it('urgent adds 50% per trip', () => {
    const q = quotePickup(10, 20, 'pickup', true, { ...PICKUP_DEFAULTS }, true)
    expect(q.perTripLei).toBe(45)
    expect(q.urgentLei).toBe(15)
  })
  it('applies the minimum per trip', () => {
    expect(quotePickup(0.5, 2, 'pickup', true).totalLei).toBe(PICKUP_DEFAULTS.minTripLei)
  })
  it('flags trips beyond the max distance', () => {
    expect(quotePickup(120, 100, 'dropoff', false).tooFar).toBe(true)
  })
})
