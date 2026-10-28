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
} from "./types";
import {
  areIntervalsOverlapping,
  compareDateStr,
  getDateRangeArray,
  isValidDateStr,
  parseYMD,
} from "./dates";
import {
  checkIncompatiblePairs,
  checkNoticeAdvance,
  checkReplacementEmployee,
  checkSalesConcurrentLimit,
  checkSummerMaxDays,
  getConfirmedLeaves,
} from "./corporateRules";
import {
  checkLegalHolidayRules,
  checkSpecialLegalReview,
  checkWorkYearParts,
  ContinuousPart,
} from "./legalChecks";

export interface PreferenceCandidate {
  leaveType?: "labor" | "unpaid";
  unpaidReason?: "personal" | "study";
  id?: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  replacementEmployeeId?: string;
  comment?: string;
  submittedAt?: string;
  submittedOn?: string;
}

export interface ValidationSummary {
  results: ValidationResult[];
  absenceDays: number;
  leaveDays: number;
  holidayDates: string[];
  summerDays: number;
  pendingSummerDays?: number;
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
  excludeRequestId?: string,
): ValidationSummary {
  const results: ValidationResult[] = [];
  const unpaid = candidate.leaveType === "unpaid";
  if (
    candidate.leaveType !== undefined &&
    !["labor", "unpaid"].includes(candidate.leaveType)
  )
    results.push({
      code: "INPUT_LEAVE_TYPE",
      kind: "input_error",
      message: "Неизвестный вид отпуска.",
    });
  if (
    unpaid &&
    (!["personal", "study"].includes(candidate.unpaidReason ?? "") ||
      !(candidate.comment ?? "").trim())
  )
    results.push({
      code: "INPUT_UNPAID_REASON",
      kind: "input_error",
      message:
        "Выберите причину неоплачиваемого отпуска и кратко опишите основание.",
    });
  const effectiveExcludeId = excludeRequestId || candidate.id;

  // 1. Basic format & date integrity checks
  const employee = state.employees.find((e) => e.id === candidate.employeeId);
  if (!employee) {
    results.push({
      code: "INPUT_EMPLOYEE_NOT_FOUND",
      kind: "input_error",
      message: "Сотрудник-заявитель не найден в справочнике компании.",
    });
  }
  if (employee && !employee.active) {
    results.push({
      code: "INPUT_EMPLOYEE_INACTIVE",
      kind: "input_error",
      message: "Сотрудник неактивен.",
    });
  }

  const isStartValid = isValidDateStr(candidate.startDate);
  const isEndValid = isValidDateStr(candidate.endDate);

  if (!isStartValid || !isEndValid) {
    results.push({
      code: "INPUT_DATES_INVALID",
      kind: "input_error",
      message: "Укажите корректные даты начала и окончания отпуска.",
    });
  } else {
    if (compareDateStr(candidate.startDate, candidate.endDate) > 0) {
      results.push({
        code: "INPUT_START_AFTER_END",
        kind: "input_error",
        message: "Дата окончания отпуска не может быть раньше даты начала.",
      });
    }

    // Supported calendar check (2027)
    const startY = parseYMD(candidate.startDate)?.year;
    const endY = parseYMD(candidate.endDate)?.year;
    if (startY !== 2027 || endY !== 2027) {
      results.push({
        code: "INPUT_CALENDAR_UNSUPPORTED",
        kind: "input_error",
        message:
          "Прототип поддерживает планирование в рамках 2027 календарного года (подтвержденный производственный календарь).",
      });
    }

    // Past dates check relative to business demo date
    if (compareDateStr(candidate.startDate, businessDate) < 0) {
      results.push({
        code: "INPUT_DATE_IN_PAST",
        kind: "input_error",
        message: `Дата начала отпуска (${candidate.startDate}) не может быть в прошлом относительно текущей даты (${businessDate}).`,
      });
    }
  }

  // If there are fundamental date errors, return early with empty stats
  if (
    results.some((r) => r.kind === "input_error") ||
    !employee ||
    !isStartValid ||
    !isEndValid
  ) {
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
      areIntervalsOverlapping(
        candidate.startDate,
        candidate.endDate,
        a.startDate,
        a.endDate,
      ),
  );

  // Check against other preferences of self (submitted or approved)
  const ownPrefs = state.preferences.filter(
    (p) =>
      p.employeeId === candidate.employeeId &&
      p.id !== effectiveExcludeId &&
      (p.status === "submitted" || p.status === "approved") &&
      areIntervalsOverlapping(
        candidate.startDate,
        candidate.endDate,
        p.startDate,
        p.endDate,
      ),
  );

  if (ownAbsences.length > 0 || ownPrefs.length > 0) {
    results.push({
      code: "INPUT_SELF_OVERLAP",
      kind: "input_error",
      message:
        "Выбранный период пересекается с вашим другим запланированным или согласованным отпуском.",
    });
  }

  // 3. Replacement employee checks (CORP-08)
  {
    const replResult = checkReplacementEmployee(
      candidate.employeeId,
      candidate.replacementEmployeeId ?? "",
      candidate.startDate,
      candidate.endDate,
      state,
      effectiveExcludeId,
    );
    if (replResult) {
      results.push(replResult);
    }
  }

  // 4. Legal checks
  // 4.1. Holidays and start date (LEGAL-01)
  const holidayCheck = unpaid
    ? {
        results: [] as ValidationResult[],
        absenceDays: getDateRangeArray(candidate.startDate, candidate.endDate)
          .length,
        leaveDays: 0,
        holidayDates: [] as string[],
      }
    : checkLegalHolidayRules(candidate.startDate, candidate.endDate);
  results.push(...holidayCheck.results);

  // 4.2. Work year parts, total days & 14 days minimum (LEGAL-02)
  const workYearCheck = unpaid
    ? {
        results: [] as ValidationResult[],
        parts: [],
        entitlementDays: 0,
        usedAndPlannedLeaveDays: 0,
        remainingDays: 0,
        hasFourteenDayPart: false,
      }
    : checkWorkYearParts(
        employee,
        candidate.startDate,
        candidate.endDate,
        state,
        effectiveExcludeId,
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
      effectiveExcludeId,
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
    effectiveExcludeId,
  );
  results.push(...incompChecks);

  // 5.3. Summer max days limit (CORP-06)
  for (const code of ["summerMaxDays", "salesMaxConcurrent", "noticeMonths"]) {
    if (
      !state.corporateRules[code] ||
      !Number.isInteger(state.corporateRules[code].value)
    ) {
      results.push({
        code: "CONFIG_RULE_" + code,
        kind: "config_review",
        message: "Не настроено корпоративное правило: " + code,
      });
    }
  }
  const summerRule =
    state.corporateRules.summerMaxDays ??
    ({ code: "summerMaxDays", value: 14, version: 0 } as any);
  const summerCheck = unpaid
    ? { result: null, totalSummerDays: 0, pendingSummerDays: 0 }
    : checkSummerMaxDays(
        candidate.employeeId,
        candidate.startDate,
        candidate.endDate,
        state,
        summerRule,
        effectiveExcludeId,
      );
  if (summerCheck.result) {
    results.push(summerCheck.result);
  }

  // 5.4. Notice advance (CORP-07)
  const noticeRule =
    state.corporateRules.noticeMonths ?? ({ value: 1, version: 0 } as any);
  const effectiveSubmittedDate =
    candidate.submittedOn ??
    (candidate.submittedAt
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Minsk",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(candidate.submittedAt))
      : businessDate);
  const noticeCheck = checkNoticeAdvance(
    candidate.startDate,
    effectiveSubmittedDate,
    noticeRule,
  );
  if (noticeCheck && !unpaid) {
    results.push(noticeCheck);
  }

  if (unpaid)
    results.push({
      code: "UNPAID_HR_BASIS",
      kind: "warning",
      message:
        candidate.unpaidReason === "study"
          ? "Учёба: HR должен проверить справку-вызов, условия учебных гарантий и положена ли оплата. Запрос не определяет право на неоплачиваемый отпуск автоматически. Перед согласованием укажите проверенное основание."
          : "Отпуск без сохранения зарплаты требует проверки основания и продолжительности HR. Перед согласованием укажите основание. Трудовой остаток не уменьшается; рабочий год может требовать кадрового уточнения.",
      sourceRef: "ТК РБ ст. 164, 189–190, 214–217",
    });

  if (unpaid && candidate.unpaidReason === "personal") {
    const dates = new Set(
      getDateRangeArray(candidate.startDate, candidate.endDate),
    );
    const intervals = [
      ...state.existingAbsences.filter(
        (a) => a.employeeId === candidate.employeeId && a.type === "unpaid",
      ),
      ...state.preferences.filter(
        (p) =>
          p.employeeId === candidate.employeeId &&
          p.id !== effectiveExcludeId &&
          p.status === "approved" &&
          p.leaveType === "unpaid" &&
          p.unpaidReason !== "study",
      ),
    ];
    intervals.forEach((a) =>
      getDateRangeArray(a.startDate, a.endDate)
        .filter((d) => d.startsWith(candidate.startDate.slice(0, 4)))
        .forEach((d) => dates.add(d)),
    );
    if (dates.size > 30)
      results.push({
        code: "UNPAID_DURATION_REVIEW",
        kind: "legal_review",
        message: `В известных записях и этом запросе ${dates.size} календарных дней неоплачиваемого отсутствия за год. Для личных обстоятельств свыше 30 дней требуется проверить отдельное основание и допустимую продолжительность. Исходные записи без вида основания требуют классификации HR. Автоматическое согласование расширенного срока в прототипе не реализовано.`,
        sourceRef: "ТК РБ ст. 189–190",
      });
  }

  // 6. Competition check (Warning only)
  // Check if any other employee in same role or department has a 'submitted' (pending) request on overlapping dates
  const competingSubmitted = state.preferences.filter(
    (p) =>
      p.id !== effectiveExcludeId &&
      p.employeeId !== candidate.employeeId &&
      ((state.employees.find((e) => e.id === p.employeeId)?.positionCode ===
        "MPP" &&
        employee.positionCode === "MPP") ||
        state.incompatibilityPairs.some(
          (pair) =>
            (pair.employeeAId === employee.id &&
              pair.employeeBId === p.employeeId) ||
            (pair.employeeBId === employee.id &&
              pair.employeeAId === p.employeeId),
        )) &&
      p.status === "submitted" &&
      areIntervalsOverlapping(
        candidate.startDate,
        candidate.endDate,
        p.startDate,
        p.endDate,
      ),
  );

  if (competingSubmitted.length > 0) {
    results.push({
      code: "COMPETITION_WARNING",
      kind: "warning",
      message: `Внимание: на пересекающиеся даты коллегами подано ${competingSubmitted.length} ожидающее(их) рассмотрения пожелание(й). Предварительные пожелания не блокируют ёмкость, но создают конкуренцию за дни.`,
      sourceRef: "Допущение A-05 регламента ООО «Авистрейд»",
    });
  }

  // Determine categories
  const hasInputErrors = results.some((r) => r.kind === "input_error");
  const hasCorporateConflicts = results.some(
    (r) => r.kind === "corporate_conflict",
  );
  const hasLegalBlocks = results.some((r) => r.kind === "legal_block");
  const hasLegalReview = results.some((r) => r.kind === "legal_review");
  const hasConfigReview = results.some((r) => r.kind === "config_review");
  const hasWarnings = results.some((r) => r.kind === "warning");

  // Any non-input hindrance requires employee checkbox acknowledgement before submission:
  // "Checkbox обязателен при любом таком препятствии или конкуренции пожеланий."
  const requiresAcknowledgement =
    hasCorporateConflicts ||
    hasLegalBlocks ||
    hasLegalReview ||
    hasConfigReview ||
    results.some((r) => r.code === "COMPETITION_WARNING");

  // Employee submission rules:
  // "При отсутствии ошибок данных отправить пожелание. Корпоративные конфликты, правовые блокировки
  // и необходимость правовой проверки не мешают передать пожелание HR, но явно показываются.
  // Checkbox обязателен при любом таком препятствии или конкуренции пожеланий."
  const canSubmitWithoutAcknowledgement =
    !hasInputErrors && !requiresAcknowledgement;
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
    summerDays: summerCheck.totalSummerDays,
    pendingSummerDays: summerCheck.pendingSummerDays,
    summerLimit: summerRule ? summerRule.value : 14,
    summerExcess: Math.max(
      0,
      summerCheck.totalSummerDays - (summerRule ? summerRule.value : 14),
    ),
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

/** Full snapshot of what the employee actually saw, including versions and conflict dates. */
export function validationFingerprint(
  summary: ValidationSummary,
  state: AppState,
): string {
  return JSON.stringify({
    results: summary.results,
    rules: Object.values(state.corporateRules).map((r) => [
      r.code,
      r.version,
      r.value,
    ]),
  });
}

/** Flag only violations of parameters changed since this decision, not unrelated old conflicts. */
export function changedApprovalConflicts(
  preference: Preference,
  state: AppState,
): ValidationResult[] {
  const versions =
    preference.approvedRuleVersions ??
    state.exceptions.find((e) => e.preferenceId === preference.id)
      ?.ruleVersions;
  if (preference.status !== "approved" || !versions) return [];
  const parameters: Record<string, string> = {
    "CORP-01": "salesMaxConcurrent",
    "CORP-06": "summerMaxDays",
    "CORP-07": "noticeMonths",
  };
  return validatePreference(
    preference,
    state,
    state.demoDate,
    preference.id,
  ).results.filter(
    (r) =>
      r.kind === "corporate_conflict" &&
      parameters[r.code] &&
      versions[parameters[r.code]] !==
        state.corporateRules[parameters[r.code]]?.version,
  );
}
