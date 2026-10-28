/**
 * Pure date calculations for LeaveFlow.
 * All business dates are handled in YYYY-MM-DD format (Europe/Minsk day boundaries).
 */

import { isOfficialHoliday, HOLIDAY_NAMES_2027 } from '../data/holidays';

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function parseYMD(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m, day: d };
}

export function isValidDateStr(dateStr: string): boolean {
  const parsed = parseYMD(dateStr);
  if (!parsed) return false;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  return (
    d.getFullYear() === parsed.year &&
    d.getMonth() === parsed.month - 1 &&
    d.getDate() === parsed.day
  );
}

export function compareDateStr(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Returns all dates between startDate and endDate inclusive as YYYY-MM-DD array.
 */
export function getDateRangeArray(startDate: string, endDate: string): string[] {
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) return [];
  if (compareDateStr(startDate, endDate) > 0) return [];

  const results: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);

  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = pad2(cur.getUTCMonth() + 1);
    const d = pad2(cur.getUTCDate());
    results.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return results;
}

/**
 * Overlap check: startA <= endB && startB <= endA
 */
export function areIntervalsOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA;
}

/**
 * Adds calendar months according to requirement:
 * "Добавление месяца с датой 31 и коротким следующим месяцем ограничивает день последним днём следующего месяца: 31 января → 28 февраля 2027 года."
 */
export function addCalendarMonths(dateStr: string, months: number): string {
  const parsed = parseYMD(dateStr);
  if (!parsed) return dateStr;

  let newYear = parsed.year;
  let newMonth = parsed.month + months;

  while (newMonth > 12) {
    newYear++;
    newMonth -= 12;
  }
  while (newMonth < 1) {
    newYear--;
    newMonth += 12;
  }

  // Days in target month
  const daysInTargetMonth = new Date(newYear, newMonth, 0).getDate();
  const newDay = Math.min(parsed.day, daysInTargetMonth);

  return `${newYear}-${pad2(newMonth)}-${pad2(newDay)}`;
}

/**
 * Calculates absence days (total calendar duration) and labor leave days (excluding official holidays).
 */
export function calculateLeaveDays(
  startDate: string,
  endDate: string
): {
  absenceDays: number;
  leaveDays: number;
  allDates: string[];
  holidayDates: string[];
  startsOnHoliday: boolean;
  hasUnknownHolidays: boolean;
} {
  const allDates = getDateRangeArray(startDate, endDate);
  const holidayDates: string[] = [];
  let hasUnknownHolidays = false;

  for (const d of allDates) {
    const holidayCheck = isOfficialHoliday(d);
    if (holidayCheck === null) {
      hasUnknownHolidays = true;
    } else if (holidayCheck) {
      holidayDates.push(d);
    }
  }

  const startsOnHoliday = allDates.length > 0 && isOfficialHoliday(startDate) === true;

  return {
    absenceDays: allDates.length,
    leaveDays: allDates.length - holidayDates.length,
    allDates,
    holidayDates,
    startsOnHoliday,
    hasUnknownHolidays,
  };
}

/**
 * Returns whether a date falls into summer (June 1 - August 31) of given year.
 */
export function isSummerDate(dateStr: string): boolean {
  const parsed = parseYMD(dateStr);
  if (!parsed) return false;
  return parsed.month >= 6 && parsed.month <= 8;
}

/**
 * Format date for friendly UI: "23 авг. 2027" or "23.08.2027"
 */
export function formatDateRu(dateStr: string, format: 'short' | 'medium' | 'full' = 'short'): string {
  const parsed = parseYMD(dateStr);
  if (!parsed) return dateStr;

  const monthsShort = [
    'янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.',
    'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'
  ];
  const monthsFull = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  if (format === 'short') {
    return `${pad2(parsed.day)}.${pad2(parsed.month)}.${parsed.year}`;
  } else if (format === 'medium') {
    return `${parsed.day} ${monthsShort[parsed.month - 1]} ${parsed.year}`;
  } else {
    return `${parsed.day} ${monthsFull[parsed.month - 1]} ${parsed.year}`;
  }
}

export function formatDateRangeRu(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDateRu(startDate, 'medium');
  const ps = parseYMD(startDate);
  const pe = parseYMD(endDate);
  if (!ps || !pe) return `${startDate} — ${endDate}`;

  if (ps.year === pe.year && ps.month === pe.month) {
    const monthsFull = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    return `${ps.day}–${pe.day} ${monthsFull[ps.month - 1]} ${ps.year}`;
  }
  return `${formatDateRu(startDate, 'medium')} — ${formatDateRu(endDate, 'medium')}`;
}

export const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const WEEKDAYS_SHORT_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function getHolidayDescription(dateStr: string): string | null {
  return HOLIDAY_NAMES_2027[dateStr] || null;
}
