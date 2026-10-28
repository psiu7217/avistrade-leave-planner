/**
 * Unified validation engine for LeaveFlow v2.0 (Avistrade)
 * Conforms to Section 8 of the Technical Specification.
 */

import {
  AppState,
  Employee,
  Preference,
  ValidationResult,
  ValidationResultKind,
} from './types';
import {
  areIntervalsOverlapping,
  compareDateStr,
  getDateRangeArray,
  isValidDateStr,
  parseYMD,
} from './dates';
import {
  checkIncompatiblePairs,
  checkNoticeAdvance,
  checkReplacementEmployee,
  checkSalesConcurrentLimit,
  checkSummerMaxDays,
  getConfirmedLeaves,
} from './corporateRules';
import {
  checkLegalHolidayRules,
  checkSpecialLegalReview,
  checkWorkYearParts,
  ContinuousPart,
} from './legalChecks';

export interface PreferenceCandidate {
  id?: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  replacementEmployeeId?: string;
  comment?: string;
  submittedAt?: string;
}

export interface ValidationSummary {
  results: ValidationResult[];
  absenceDays: number;
  leaveDays: number;
  holidayDates: string[];
  summerDays: number;
  summerLimit: number;
  summerExcess: number;
  workYearEntitlement: number;
  workYearUsedAndPlanned: number;
  workYearRemaining: number;
  parts: ContinuousPart[];
  hasFourteenDayPart: boolean;

  hasInputErrors: boolean;
  hasCorporateConflicts: boolean;
  hasLegalBlocks: boolean;
  hasLegalReview: boolean;
  hasWarnings: boolean;

  canSubmitWithoutAcknowledgement: boolean;
  canSubmitWithAcknowledgement: boolean;
  canApproveNormally: boolean;
  canApproveAsException: boolean;
  requiresAcknowledgement: boolean;
}

export function validatePreference(
  candidate: PreferenceCandidate,
  state: AppState,
  businessDate: string = state.demoDate,
  excludeRequestId?: string
): ValidationSummary {
  const results: ValidationResult[] = [];
  const effectiveExcludeId = excludeRequestId || candidate.id;

  // 1. Basic format & date integrity checks
  const employee = state.employees.find((e) => e.id === candidate.employeeId);
  if (!employee) {
    results.push({
      code: 'INPUT_EMPLOYEE_NOT_FOUND',
      kind: 'input_error',
      message: 'Сотрудник-заявитель не найден в справочнике компании.',
    });
  }

  const isStartValid = isValidDateStr(candidate.startDate);
  const isEndValid = isValidDateStr(candidate.endDate);

  if (!isStartValid || !isEndValid) {
    results.push({
      code: 'INPUT_DATES_INVALID',
      kind: 'input_error',
      message: 'Укажите корректные даты начала и окончания отпуска.',
    });
  } else {
    if (compareDateStr(candidate.startDate, candidate.endDate) > 0) {
      results.push({
        code: 'INPUT_START_AFTER_END',
        kind: 'input_error',
        message: 'Дата окончания отпуска не может быть раньше даты начала.',
      });
    }

    // Supported calendar check (2027)
    const startY = parseYMD(candidate.startDate)?.year;
    const endY = parseYMD(candidate.endDate)?.year;
    if (startY !== 2027 || endY !== 2027) {
      results.push({
        code: 'INPUT_CALENDAR_UNSUPPORTED',
        kind: 'input_error',
        message: 'Прототип поддерживает планирование в рамках 2027 календарного года (подтвержденный производственный календарь).',
      });
    }

    // Past dates check relative to business demo date
    if (compareDateStr(candidate.startDate, businessDate) < 0) {
      results.push({
        code: 'INPUT_DATE_IN_PAST',
        kind: 'input_error',
        message: `Дата начала отпуска (${candidate.startDate}) не может быть в прошлом относительно текущей даты (${businessDate}).`,
      });
    }
  }

  // If there are fundamental date errors, return early with empty stats
  if (results.some((r) => r.kind === 'input_error') || !employee || !isStartValid || !isEndValid) {
    return {
      results,
      absenceDays: 0,
      leaveDays: 0,
      holidayDates: [],
      summerDays: 0,
      summerLimit: state.corporateRules.summerMaxDays?.value ?? 14,
      summerExcess: 0,
      workYearEntitlement: 24,
      workYearUsedAndPlanned: 0,
      workYearRemaining: 24,
      parts: [],
      hasFourteenDayPart: false,
      hasInputErrors: true,
      hasCorporateConflicts: false,
      hasLegalBlocks: false,
      hasLegalReview: false,
      hasWarnings: false,
      canSubmitWithoutAcknowledgement: false,
      canSubmitWithAcknowledgement: false,
      canApproveNormally: false,
      canApproveAsException: false,
      requiresAcknowledgement: false,
    };
  }

  // 2. Check self-overlap with own active absences and preferences
  // Check against existing absences
  const ownAbsences = state.existingAbsences.filter(
    (a) =>
      a.employeeId === candidate.employeeId &&
      a.id !== effectiveExcludeId &&
      areIntervalsOverlapping(candidate.startDate, candidate.endDate, a.startDate, a.endDate)
  );

  // Check against other preferences of self (submitted or approved)
  const ownPrefs = state.preferences.filter(
    (p) =>
      p.employeeId === candidate.employeeId &&
      p.id !== effectiveExcludeId &&
      (p.status === 'submitted' || p.status === 'approved') &&
      areIntervalsOverlapping(candidate.startDate, candidate.endDate, p.startDate, p.endDate)
  );

  if (ownAbsences.length > 0 || ownPrefs.length > 0) {
    results.push({
      code: 'INPUT_SELF_OVERLAP',
      kind: 'input_error',
      message: 'Выбранный период пересекается с вашим другим запланированным или согласованным отпуском.',
    });
  }

  // 3. Replacement employee checks (CORP-08)
  if (candidate.replacementEmployeeId !== undefined) {
    const replResult = checkReplacementEmployee(
      candidate.employeeId,
      candidate.replacementEmployeeId,
      candidate.startDate,
      candidate.endDate,
      state,
      effectiveExcludeId
    );
    if (replResult) {
      results.push(replResult);
    }
  }

  // 4. Legal checks
  // 4.1. Holidays and start date (LEGAL-01)
  const holidayCheck = checkLegalHolidayRules(candidate.startDate, candidate.endDate);
  results.push(...holidayCheck.results);

  // 4.2. Work year parts, total days & 14 days minimum (LEGAL-02)
  const workYearCheck = checkWorkYearParts(
    employee,
    candidate.startDate,
    candidate.endDate,
    state,
    effectiveExcludeId
  );
  results.push(...workYearCheck.results);

  // 4.3. Special legal category (LEGAL-03)
  const specialCheck = checkSpecialLegalReview(employee);
  if (specialCheck) {
    results.push(specialCheck);
  }

  // 5. Corporate Rules checks
  // 5.1. Sales concurrent limit (CORP-01)
  const salesRule = state.corporateRules.salesMaxConcurrent;
  if (salesRule) {
    const salesCheck = checkSalesConcurrentLimit(
      employee,
      candidate.startDate,
      candidate.endDate,
      state,
      salesRule,
      effectiveExcludeId
    );
    if (salesCheck) {
      results.push(salesCheck);
    }
  }

  // 5.2. Incompatible pairs (CORP-02, CORP-03, CORP-04, CORP-05)
  const incompChecks = checkIncompatiblePairs(
    candidate.employeeId,
    candidate.startDate,
    candidate.endDate,
    state,
    effectiveExcludeId
  );
  results.push(...incompChecks);

  // 5.3. Summer max days limit (CORP-06)
  const summerRule = state.corporateRules.summerMaxDays;
  const summerCheck = checkSummerMaxDays(
    candidate.employeeId,
    candidate.startDate,
    candidate.endDate,
    state,
    summerRule,
    effectiveExcludeId
  );
  if (summerCheck.result) {
    results.push(summerCheck.result);
  }

  // 5.4. Notice advance (CORP-07)
  const noticeRule = state.corporateRules.noticeMonths;
  const effectiveSubmittedDate = candidate.submittedAt
    ? candidate.submittedAt.slice(0, 10)
    : businessDate;
  const noticeCheck = checkNoticeAdvance(
    candidate.startDate,
    effectiveSubmittedDate,
    noticeRule
  );
  if (noticeCheck) {
    results.push(noticeCheck);
  }

  // 6. Competition check (Warning only)
  // Check if any other employee in same role or department has a 'submitted' (pending) request on overlapping dates
  const competingSubmitted = state.preferences.filter(
    (p) =>
      p.id !== effectiveExcludeId &&
      p.employeeId !== candidate.employeeId &&
      p.status === 'submitted' &&
      areIntervalsOverlapping(candidate.startDate, candidate.endDate, p.startDate, p.endDate)
  );

  if (competingSubmitted.length > 0) {
    results.push({
      code: 'COMPETITION_WARNING',
      kind: 'warning',
      message: `Внимание: на пересекающиеся даты коллегами подано ${competingSubmitted.length} ожидающее(их) рассмотрения пожелание(й). Предварительные пожелания не блокируют ёмкость, но создают конкуренцию за дни.`,
      sourceRef: 'Допущение A-05 регламента ООО «Авистрейд»',
    });
  }

  // Determine categories
  const hasInputErrors = results.some((r) => r.kind === 'input_error');
  const hasCorporateConflicts = results.some((r) => r.kind === 'corporate_conflict');
  const hasLegalBlocks = results.some((r) => r.kind === 'legal_block');
  const hasLegalReview = results.some((r) => r.kind === 'legal_review');
  const hasConfigReview = results.some((r) => r.kind === 'config_review');
  const hasWarnings = results.some((r) => r.kind === 'warning');

  // Any non-input hindrance requires employee checkbox acknowledgement before submission:
  // "Checkbox обязателен при любом таком препятствии или конкуренции пожеланий."
  const requiresAcknowledgement =
    hasCorporateConflicts || hasLegalBlocks || hasLegalReview || hasConfigReview || hasWarnings;

  // Employee submission rules:
  // "При отсутствии ошибок данных отправить пожелание. Корпоративные конфликты, правовые блокировки
  // и необходимость правовой проверки не мешают передать пожелание HR, но явно показываются.
  // Checkbox обязателен при любом таком препятствии или конкуренции пожеланий."
  const canSubmitWithoutAcknowledgement = !hasInputErrors && !requiresAcknowledgement;
  const canSubmitWithAcknowledgement = !hasInputErrors;

  // HR normal approval:
  // "Согласовать: нет блокирующих корпоративных, правовых и конфигурационных результатов"
  const canApproveNormally =
    !hasInputErrors &&
    !hasCorporateConflicts &&
    !hasLegalBlocks &&
    !hasLegalReview &&
    !hasConfigReview;

  // HR corporate exception approval:
  // "Согласовать как исключение: Есть корпоративный конфликт; нет правового/конфигурационного препятствия; заполнено основание"
  const canApproveAsException =
    !hasInputErrors &&
    hasCorporateConflicts &&
    !hasLegalBlocks &&
    !hasLegalReview &&
    !hasConfigReview;

  return {
    results,
    absenceDays: holidayCheck.absenceDays,
    leaveDays: holidayCheck.leaveDays,
    holidayDates: holidayCheck.holidayDates,
    summerDays: summerCheck.candidateSummerDays,
    summerLimit: summerRule ? summerRule.value : 14,
    summerExcess: Math.max(0, summerCheck.totalSummerDays - (summerRule ? summerRule.value : 14)),
    workYearEntitlement: workYearCheck.entitlementDays,
    workYearUsedAndPlanned: workYearCheck.usedAndPlannedLeaveDays,
    workYearRemaining: workYearCheck.remainingDays,
    parts: workYearCheck.parts,
    hasFourteenDayPart: workYearCheck.hasFourteenDayPart,
    hasInputErrors,
    hasCorporateConflicts,
    hasLegalBlocks,
    hasLegalReview,
    hasWarnings,
    canSubmitWithoutAcknowledgement,
    canSubmitWithAcknowledgement,
    canApproveNormally,
    canApproveAsException,
    requiresAcknowledgement,
  };
}
