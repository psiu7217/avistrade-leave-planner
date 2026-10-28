/**
 * Corporate rules engine for LeaveFlow v2.0 (Avistrade)
 * Covers CORP-01 to CORP-08 according to Section 6 of the Technical Specification.
 */

import {
  AppState,
  CorporateRule,
  Employee,
  ExistingAbsence,
  Preference,
  ValidationResult,
} from './types';
import {
  addCalendarMonths,
  areIntervalsOverlapping,
  calculateLeaveDays,
  compareDateStr,
  getDateRangeArray,
  isSummerDate,
  parseYMD,
} from './dates';
import { isOfficialHoliday } from '../data/holidays';

export interface ConfirmedLeaveInterval {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  type: string;
}

/**
 * Collects all active confirmed leaves from existing absences and approved preferences.
 * Excludes candidate preference by excludeId.
 */
export function getConfirmedLeaves(
  state: AppState,
  excludeId?: string
): ConfirmedLeaveInterval[] {
  const result: ConfirmedLeaveInterval[] = [];

  for (const abs of state.existingAbsences) {
    if (abs.id !== excludeId) {
      result.push({
        id: abs.id,
        employeeId: abs.employeeId,
        startDate: abs.startDate,
        endDate: abs.endDate,
        type: abs.type,
      });
    }
  }

  for (const pref of state.preferences) {
    if (pref.status === 'approved' && pref.id !== excludeId) {
      result.push({
        id: pref.id,
        employeeId: pref.employeeId,
        startDate: pref.startDate,
        endDate: pref.endDate,
        type: 'labor',
      });
    }
  }

  return result;
}

/**
 * Checks CORP-01: Sales Managers concurrent limit.
 * "Для каждого дня кандидата вычислить число уникальных МПП в подтверждённых отсутствиях плюс кандидата;
 * конфликт только если число больше параметра salesMaxConcurrent, исходно 2"
 */
export function checkSalesConcurrentLimit(
  candidateEmployee: Employee,
  startDate: string,
  endDate: string,
  state: AppState,
  rule: CorporateRule,
  excludeId?: string
): ValidationResult | null {
  if (candidateEmployee.positionCode !== 'MPP') return null;

  const candidateDates = getDateRangeArray(startDate, endDate);
  const mppEmployees = new Set(
    state.employees.filter((e) => e.positionCode === 'MPP').map((e) => e.id)
  );
  const confirmed = getConfirmedLeaves(state, excludeId);

  // Filter confirmed leaves belonging to MPP
  const mppConfirmed = confirmed.filter(
    (c) => mppEmployees.has(c.employeeId) && c.employeeId !== candidateEmployee.id
  );

  const conflictingDates: string[] = [];
  const conflictingEmployeeIds = new Set<string>();
  let maxCountFound = 0;

  for (const d of candidateDates) {
    // Unique MPP absent on date d
    const absentMppOnDay = new Set<string>();
    for (const c of mppConfirmed) {
      if (areIntervalsOverlapping(c.startDate, c.endDate, d, d)) {
        absentMppOnDay.add(c.employeeId);
      }
    }

    // Include candidate
    const totalOnDay = absentMppOnDay.size + 1;
    if (totalOnDay > maxCountFound) {
      maxCountFound = totalOnDay;
    }

    if (totalOnDay > rule.value) {
      conflictingDates.push(d);
      absentMppOnDay.forEach((id) => conflictingEmployeeIds.add(id));
    }
  }

  if (conflictingDates.length > 0) {
    const limit = rule.value;
    return {
      code: 'CORP-01',
      kind: 'corporate_conflict',
      ruleVersion: rule.version,
      actual: maxCountFound,
      limit: limit,
      affectedDates: conflictingDates,
      conflictingEmployeeIds: Array.from(conflictingEmployeeIds),
      message: `Превышен лимит одновременного отсутствия менеджеров продаж: на ${conflictingDates.length} дн. запланировано ${maxCountFound} чел. при лимите не более ${limit} одновременно.`,
      sourceRef: 'Регламент ООО «Авистрейд» от 15.07.2026, п. 2.1',
    };
  }

  return null;
}

/**
 * Checks CORP-02, CORP-03, CORP-04, CORP-05: Incompatible employee pairs.
 */
export function checkIncompatiblePairs(
  candidateEmployeeId: string,
  startDate: string,
  endDate: string,
  state: AppState,
  excludeId?: string
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const confirmed = getConfirmedLeaves(state, excludeId);

  // Find all pairs involving candidateEmployeeId
  const relevantPairs = state.incompatibilityPairs.filter(
    (p) => p.employeeAId === candidateEmployeeId || p.employeeBId === candidateEmployeeId
  );

  for (const pair of relevantPairs) {
    const otherId =
      pair.employeeAId === candidateEmployeeId ? pair.employeeBId : pair.employeeAId;

    // Check if otherId is absent on overlapping dates
    const otherAbsences = confirmed.filter(
      (c) =>
        c.employeeId === otherId &&
        areIntervalsOverlapping(startDate, endDate, c.startDate, c.endDate)
    );

    if (otherAbsences.length > 0) {
      const datesOverlap: string[] = [];
      const candidateDates = getDateRangeArray(startDate, endDate);

      for (const d of candidateDates) {
        if (
          otherAbsences.some((a) =>
            areIntervalsOverlapping(a.startDate, a.endDate, d, d)
          )
        ) {
          datesOverlap.push(d);
        }
      }

      const otherEmp = state.employees.find((e) => e.id === otherId);
      const otherName = otherEmp ? otherEmp.name : otherId;

      results.push({
        code: pair.ruleCode,
        kind: 'corporate_conflict',
        affectedDates: datesOverlap,
        conflictingEmployeeIds: [otherId],
        message: `Недопустимо одновременное отсутствие по должности (${pair.scopeDescription}): пересечение с сотрудником ${otherName} на ${datesOverlap.length} дн.`,
        sourceRef: `Регламент ООО «Авистрейд», ${pair.ruleCode}`,
      });
    }
  }

  return results;
}

/**
 * Checks CORP-06: Summer maximum days limit (01.06 - 31.08).
 * "Летний максимум трактуем как 14 дней суммарно за лето одного календарного года."
 */
export function checkSummerMaxDays(
  candidateEmployeeId: string,
  startDate: string,
  endDate: string,
  state: AppState,
  rule: CorporateRule,
  excludeId?: string
): {
  result: ValidationResult | null;
  totalSummerDays: number;
  candidateSummerDays: number;
  approvedSummerDays: number;
  pendingSummerDays: number;
} {
  const summerLimit = rule.value;

  // 1. Collect labor leave days of employee in summer from approved / existing
  const confirmed = getConfirmedLeaves(state, excludeId).filter(
    (c) => c.employeeId === candidateEmployeeId && c.type === 'labor'
  );

  const approvedSummerDates = new Set<string>();
  for (const c of confirmed) {
    const dates = getDateRangeArray(c.startDate, c.endDate);
    for (const d of dates) {
      if (isSummerDate(d) && !isOfficialHoliday(d)) {
        approvedSummerDates.add(d);
      }
    }
  }

  // 2. Candidate summer days
  const candidateDates = getDateRangeArray(startDate, endDate);
  const candidateSummerDates = new Set<string>();
  for (const d of candidateDates) {
    if (isSummerDate(d) && !isOfficialHoliday(d)) {
      candidateSummerDates.add(d);
    }
  }

  // Union of approved + candidate
  const combinedSummerDates = new Set<string>([
    ...Array.from(approvedSummerDates),
    ...Array.from(candidateSummerDates),
  ]);

  // 3. Pending (submitted) other requests forecast
  const pendingSummerDates = new Set<string>();
  for (const pref of state.preferences) {
    if (
      pref.employeeId === candidateEmployeeId &&
      pref.status === 'submitted' &&
      pref.id !== excludeId
    ) {
      const dates = getDateRangeArray(pref.startDate, pref.endDate);
      for (const d of dates) {
        if (isSummerDate(d) && !isOfficialHoliday(d)) {
          pendingSummerDates.add(d);
        }
      }
    }
  }

  const totalSummerDays = combinedSummerDates.size;
  const excess = totalSummerDays - summerLimit;

  let result: ValidationResult | null = null;
  if (excess > 0) {
    result = {
      code: 'CORP-06',
      kind: 'corporate_conflict',
      ruleVersion: rule.version,
      actual: totalSummerDays,
      limit: summerLimit,
      message: `Превышен летний лимит отпуска (01.06–31.08): суммарный расход составит ${totalSummerDays} дн. при корпоративном лимите ${summerLimit} дн. (превышение на ${excess} дн.).`,
      sourceRef: 'Регламент ООО «Авистрейд», п. 3.2 (допущение A-03)',
    };
  }

  return {
    result,
    totalSummerDays,
    candidateSummerDays: candidateSummerDates.size,
    approvedSummerDays: approvedSummerDates.size,
    pendingSummerDays: pendingSummerDates.size,
  };
}

/**
 * Checks CORP-07: Advance notice period (noticeMonths).
 * Threshold = addCalendarMonths(submittedOn, noticeMonths).
 * If startDate < threshold -> corporate conflict requiring exception.
 */
export function checkNoticeAdvance(
  startDate: string,
  submittedOn: string,
  rule: CorporateRule
): ValidationResult | null {
  const noticeMonths = rule.value;
  if (noticeMonths <= 0) return null;

  const thresholdDate = addCalendarMonths(submittedOn, noticeMonths);
  if (compareDateStr(startDate, thresholdDate) < 0) {
    return {
      code: 'CORP-07',
      kind: 'corporate_conflict',
      ruleVersion: rule.version,
      actual: startDate,
      limit: thresholdDate,
      message: `Пожелание подано менее чем за ${noticeMonths} календарный месяц(а) до начала: дата старта ${startDate} раньше необходимого срока ${thresholdDate}. Требуется отдельное рассмотрение исключения.`,
      sourceRef: 'Регламент ООО «Авистрейд», п. 1.4',
    };
  }

  return null;
}

/**
 * Checks CORP-08: Replacement employee.
 * - Must be selected, active, not self.
 * - Must not be in confirmed absence during overlapping dates.
 */
export function checkReplacementEmployee(
  candidateEmployeeId: string,
  replacementEmployeeId: string,
  startDate: string,
  endDate: string,
  state: AppState,
  excludeId?: string
): ValidationResult | null {
  if (!replacementEmployeeId) {
    return {
      code: 'INPUT_REPLACEMENT_REQUIRED',
      kind: 'input_error',
      message: 'Не выбран замещающий сотрудник.',
    };
  }

  if (replacementEmployeeId === candidateEmployeeId) {
    return {
      code: 'INPUT_REPLACEMENT_SELF',
      kind: 'input_error',
      message: 'Замещающим сотрудником не может быть указан сам заявитель.',
    };
  }

  const replacement = state.employees.find((e) => e.id === replacementEmployeeId);
  if (!replacement || !replacement.active) {
    return {
      code: 'INPUT_REPLACEMENT_INACTIVE',
      kind: 'input_error',
      message: 'Указанный замещающий сотрудник не найден или не активен.',
    };
  }

  // Check if replacement has confirmed absence overlapping candidate period
  const confirmed = getConfirmedLeaves(state, excludeId);
  const replacementAbsences = confirmed.filter(
    (c) =>
      c.employeeId === replacementEmployeeId &&
      areIntervalsOverlapping(startDate, endDate, c.startDate, c.endDate)
  );

  if (replacementAbsences.length > 0) {
    const datesOverlap: string[] = [];
    const candidateDates = getDateRangeArray(startDate, endDate);
    for (const d of candidateDates) {
      if (
        replacementAbsences.some((a) =>
          areIntervalsOverlapping(a.startDate, a.endDate, d, d)
        )
      ) {
        datesOverlap.push(d);
      }
    }

    return {
      code: 'CORP-08',
      kind: 'corporate_conflict',
      conflictingEmployeeIds: [replacementEmployeeId],
      affectedDates: datesOverlap,
      message: `Замещающий сотрудник (${replacement.name}) сам находится в подтвержденном отпуске на даты пересечения (${datesOverlap.length} дн.).`,
      sourceRef: 'Регламент ООО «Авистрейд», п. 2.4',
    };
  }

  return null;
}
