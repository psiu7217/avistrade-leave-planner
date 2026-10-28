/**
 * Official non-working public holidays in the Republic of Belarus according to Article 151 Labor Code of RB
 * and official notices (S-05, S-08).
 * Year 2027:
 * - 1, 2, 7 January
 * - 8 March
 * - 1, 9 May
 * - 11 May (Radonitsa / Радуница)
 * - 3 July (Independence Day / День Независимости)
 * - 7 November (October Revolution Day)
 * - 25 December (Catholic Christmas)
 */

export const HOLIDAYS_2027: string[] = [
  '2027-01-01',
  '2027-01-02',
  '2027-01-07',
  '2027-03-08',
  '2027-05-01',
  '2027-05-09',
  '2027-05-11', // Радуница (S-08)
  '2027-07-03',
  '2027-11-07',
  '2027-12-25',
];

export const HOLIDAY_NAMES_2027: Record<string, string> = {
  '2027-01-01': 'Новый год',
  '2027-01-02': 'Новый год (второй день)',
  '2027-01-07': 'Рождество Христово (православное)',
  '2027-03-08': 'День женщин',
  '2027-05-01': 'Праздник труда',
  '2027-05-09': 'День Победы',
  '2027-05-11': 'Радуница (по календарю конфессии)',
  '2027-07-03': 'День Независимости Республики Беларусь',
  '2027-11-07': 'День Октябрьской революции',
  '2027-12-25': 'Рождество Христово (католическое)',
};

/**
 * Checks if a specific date string (YYYY-MM-DD) is an official holiday for supported years.
 * Returns null if calendar is unknown for that year (triggers legal_review).
 */
export function isOfficialHoliday(dateStr: string): boolean | null {
  const year = dateStr.slice(0, 4);
  if (year === '2027') {
    return HOLIDAYS_2027.includes(dateStr);
  }
  return null; // Unknown year
}

export function getHolidayDescription(dateStr: string): string | null {
  return HOLIDAY_NAMES_2027[dateStr] || null;
}

