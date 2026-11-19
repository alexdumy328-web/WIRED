import type { Job } from '../types.ts';

export type EstimateResult = {
  priceFrom: number;
  priceTo: number;
  etaHours: [number, number];
  needsDiagnosis: boolean;
};

/**
 * Calculates price range, estimated turnaround / duration, and diagnosis flag.
 * - Sums priceFrom
 * - Sums (priceTo ?? priceFrom)
 * - eta = [max of mins, max of maxes] for shop jobs, sums duration for mobile jobs
 * - needsDiagnosis true if hasCustom or any job.needsDiagnosis
 * - Empty jobs -> zeros
 */
export function estimate(jobs: Job[], hasCustom: boolean): EstimateResult {
  if (jobs.length === 0) {
    return {
      priceFrom: 0,
      priceTo: 0,
      etaHours: [0, 0],
      needsDiagnosis: hasCustom,
    };
  }

  let priceFrom = 0;
  let priceTo = 0;
  let needsDiagnosis = hasCustom;

  const shopJobs: Job[] = [];
  const mobileJobs: Job[] = [];

  for (const job of jobs) {
    priceFrom += job.priceFrom;
    priceTo += job.priceTo ?? job.priceFrom;
    if (job.needsDiagnosis) {
      needsDiagnosis = true;
    }
    if (job.mode === 'shop') {
      shopJobs.push(job);
    } else {
      mobileJobs.push(job);
    }
  }

  let shopMin = 0;
  let shopMax = 0;
  if (shopJobs.length > 0) {
    shopMin = Math.max(...shopJobs.map((j) => j.etaHours[0]));
    shopMax = Math.max(...shopJobs.map((j) => j.etaHours[1]));
  }

  let mobileMin = 0;
  let mobileMax = 0;
  for (const j of mobileJobs) {
    mobileMin += j.etaHours[0];
    mobileMax += j.etaHours[1];
  }

  const etaHours: [number, number] = [
    shopMin + mobileMin,
    shopMax + mobileMax,
  ];

  return {
    priceFrom,
    priceTo,
    etaHours,
    needsDiagnosis,
  };
}

/**
 * Formats ETA range in hours / days:
 * - under 24 h: "2–4 h" (same for ro and en)
 * - 24 h or more: days rounded up, "2–5 zile" / "2–5 days"
 * - single day: "1 zi" / "1 day"
 * - when min == max: show one number
 * Uses the en dash "–".
 */
export function formatEta(hours: [number, number], lang: 'ro' | 'en'): string {
  const [min, max] = hours;

  if (max < 24) {
    if (min === max) {
      return `${min} h`;
    }
    return `${min}–${max} h`;
  }

  const minDays = Math.max(1, Math.ceil(min / 24));
  const maxDays = Math.ceil(max / 24);

  if (minDays === maxDays) {
    if (minDays === 1) {
      return lang === 'ro' ? '1 zi' : '1 day';
    }
    return `${minDays} ${lang === 'ro' ? 'zile' : 'days'}`;
  }

  return `${minDays}–${maxDays} ${lang === 'ro' ? 'zile' : 'days'}`;
}

/**
 * Formats a currency amount in Lei with thousand separators:
 * - "1.250 lei" in ro (dot thousands separator)
 * - "1,250 lei" in en (comma thousands separator)
 */
export function formatLei(n: number, lang: 'ro' | 'en'): string {
  const separator = lang === 'ro' ? '.' : ',';
  const parts = n.toString().split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const formatted =
    parts.length > 1
      ? `${integerPart}${lang === 'ro' ? ',' : '.'}${parts[1]}`
      : integerPart;
  return `${formatted} lei`;
}
