export type BucharestParts = {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  weekday: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
};

export const ROMANIAN_HOLIDAYS: readonly string[] = [
  // 2026
  '2026-01-01',
  '2026-01-02',
  '2026-01-06',
  '2026-01-07',
  '2026-01-24',
  '2026-04-10', // Orthodox Good Friday
  '2026-04-12', // Orthodox Easter Sunday
  '2026-04-13', // Orthodox Easter Monday
  '2026-05-01',
  '2026-05-31', // Pentecost Sunday
  '2026-06-01', // Pentecost Monday / Children's Day
  '2026-08-15',
  '2026-11-30',
  '2026-12-01',
  '2026-12-25',
  '2026-12-26',
  // 2027
  '2027-01-01',
  '2027-01-02',
  '2027-01-06',
  '2027-01-07',
  '2027-01-24',
  '2027-04-30', // Orthodox Good Friday
  '2027-05-01', // Labour Day
  '2027-05-02', // Orthodox Easter Sunday
  '2027-05-03', // Orthodox Easter Monday
  '2027-06-01', // Children's Day
  '2027-06-20', // Pentecost Sunday
  '2027-06-21', // Pentecost Monday
  '2027-08-15',
  '2027-11-30',
  '2027-12-01',
  '2027-12-25',
  '2027-12-26',
];

const HOLIDAYS_SET = new Set(ROMANIAN_HOLIDAYS);

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
});

/**
 * Extracts wall-clock parts for Europe/Bucharest timezone.
 * Weekday: 0=Sunday, 1=Monday, ..., 6=Saturday.
 */
export function bucharestParts(date: Date): BucharestParts {
  const parts = dtf.formatToParts(date);
  let y = 0;
  let m = 0;
  let d = 0;
  let hh = 0;
  let mm = 0;
  let weekday = 0;

  for (const part of parts) {
    if (part.type === 'year') y = parseInt(part.value, 10);
    else if (part.type === 'month') m = parseInt(part.value, 10);
    else if (part.type === 'day') d = parseInt(part.value, 10);
    else if (part.type === 'hour') hh = parseInt(part.value, 10);
    else if (part.type === 'minute') mm = parseInt(part.value, 10);
    else if (part.type === 'weekday') weekday = WEEKDAY_MAP[part.value] ?? 0;
  }

  return { y, m, d, hh, mm, weekday };
}

/**
 * Converts a Europe/Bucharest wall-clock date and time into a UTC Date.
 * Dynamically resolves DST offset via Intl.
 */
export function bucharestWallToUTC(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm = 0
): Date {
  const desiredWall = Date.UTC(y, m - 1, d, hh, mm);
  const testDate = new Date(desiredWall);
  const p1 = bucharestParts(testDate);
  const wallAtTest = Date.UTC(p1.y, p1.m - 1, p1.d, p1.hh, p1.mm);
  const offset1 = wallAtTest - testDate.getTime();

  const candidate = new Date(desiredWall - offset1);
  const p2 = bucharestParts(candidate);
  const wallAtCandidate = Date.UTC(p2.y, p2.m - 1, p2.d, p2.hh, p2.mm);
  const offset2 = wallAtCandidate - candidate.getTime();

  return new Date(desiredWall - offset2);
}

/**
 * Checks if a given YYYY-MM-DD string is a Romanian public holiday in 2026/2027.
 */
export function isHoliday(dateStr: string): boolean {
  return HOLIDAYS_SET.has(dateStr);
}

function formatDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * True if the shop is currently open at the given instant.
 * Shop hours: Mon-Fri 09:00-18:00, Sat 10:00-14:00, Sun & holidays closed.
 */
export function isOpenAt(date: Date): boolean {
  const p = bucharestParts(date);
  const dateStr = formatDateStr(p.y, p.m, p.d);

  if (p.weekday === 0 || isHoliday(dateStr)) {
    return false;
  }

  const openH = p.weekday === 6 ? 10 : 9;
  const closeH = p.weekday === 6 ? 14 : 18;

  const openInstant = bucharestWallToUTC(p.y, p.m, p.d, openH, 0);
  const closeInstant = bucharestWallToUTC(p.y, p.m, p.d, closeH, 0);

  return (
    date.getTime() >= openInstant.getTime() &&
    date.getTime() < closeInstant.getTime()
  );
}

/**
 * Returns today's closing instant if the shop is open now, or null if closed.
 */
export function closingTime(date: Date): Date | null {
  if (!isOpenAt(date)) {
    return null;
  }

  const p = bucharestParts(date);
  const closeH = p.weekday === 6 ? 14 : 18;
  return bucharestWallToUTC(p.y, p.m, p.d, closeH, 0);
}

/**
 * Returns the next instant the shop opens.
 * If open now, returns the given date.
 */
export function nextOpening(date: Date): Date {
  if (isOpenAt(date)) {
    return new Date(date.getTime());
  }

  const p = bucharestParts(date);
  const todayStr = formatDateStr(p.y, p.m, p.d);

  // If today is a business day and we are before opening hours:
  if (p.weekday !== 0 && !isHoliday(todayStr)) {
    const todayOpenH = p.weekday === 6 ? 10 : 9;
    const todayOpenInstant = bucharestWallToUTC(p.y, p.m, p.d, todayOpenH, 0);
    if (date.getTime() < todayOpenInstant.getTime()) {
      return todayOpenInstant;
    }
  }

  // Otherwise, search subsequent days
  for (let offset = 1; offset <= 365; offset++) {
    const target = new Date(Date.UTC(p.y, p.m - 1, p.d + offset, 12, 0));
    const y = target.getUTCFullYear();
    const m = target.getUTCMonth() + 1;
    const d = target.getUTCDate();
    const dayOfWeek = target.getUTCDay();
    const str = formatDateStr(y, m, d);

    if (dayOfWeek === 0 || isHoliday(str)) {
      continue;
    }

    const openH = dayOfWeek === 6 ? 10 : 9;
    return bucharestWallToUTC(y, m, d, openH, 0);
  }

  throw new Error('Could not find next opening date');
}
