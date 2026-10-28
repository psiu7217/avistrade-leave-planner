/**
 * Selected legal checks for LeaveFlow v2.0 according to Labor Code of the Republic of Belarus (ТК РБ).
 * Section 7 of the Technical Specification.
 */

import { AppState, Employee, ValidationResult, WorkYear } from "./types";
import {
  calculateLeaveDays,
  compareDateStr,
  getDateRangeArray,
  isValidDateStr,
  parseYMD,
} from "./dates";
import { getHolidayDescription } from "./dates";
import { getConfirmedLeaves } from "./corporateRules";

export interface ContinuousPart {
  startDate: string;
  endDate: string;
  leaveDays: number;
  absenceDays: number;
}

/**
 * Merges adjacent labor leave dates into continuous contiguous parts.
 */
export function mergeIntoContinuousParts(dates: string[]): ContinuousPart[] {
  if (dates.length === 0) return [];
  const sorted = Array.from(new Set(dates)).sort(compareDateStr);

  const parts: ContinuousPart[] = [];
  let partStart = sorted[0];
  let partEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    // Check if cur is the very next day after partEnd
    const [ey, em, ed] = partEnd.split("-").map(Number);
    const nextDate = new Date(Date.UTC(ey, em - 1, ed + 1));
    const nextStr = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDate.getUTCDate()).padStart(2, "0")}`;

    if (cur === nextStr) {
      partEnd = cur;
    } else {
      const calc = calculateLeaveDays(partStart, partEnd);
      parts.push({
        startDate: partStart,
        endDate: partEnd,
        leaveDays: calc.leaveDays,
        absenceDays: calc.absenceDays,
      });
      partStart = cur;
      partEnd = cur;
    }
  }

  const finalCalc = calculateLeaveDays(partStart, partEnd);
  parts.push({
    startDate: partStart,
    endDate: partEnd,
    leaveDays: finalCalc.leaveDays,
    absenceDays: finalCalc.absenceDays,
  });

  return parts;
}

/**
 * Checks LEGAL-01: Labor leave calculation and start date on holiday (ст. 151 ТК РБ).
 */
export function checkLegalHolidayRules(
  startDate: string,
  endDate: string,
): {
  results: ValidationResult[];
  absenceDays: number;
  leaveDays: number;
  holidayDates: string[];
} {
  const results: ValidationResult[] = [];
  const calc = calculateLeaveDays(startDate, endDate);

  if (calc.hasUnknownHolidays) {
    results.push({
      code: "LEGAL-01-UNKNOWN-YEAR",
      kind: "legal_review",
      message:
        "Календарь официальных праздников для указанного года не проверен. Требуется правовая проверка.",
      sourceRef: "ТК РБ ст. 151",
    });
  }

  if (calc.leaveDays <= 0) {
    results.push({
      code: "LEGAL-01-ZERO-DAYS",
      kind: "legal_block",
      message:
        "Выбранный период состоит исключительно из официальных нерабочих праздников (0 дней трудового отпуска). Предоставление отпуска невозможно.",
      sourceRef: "ТК РБ ст. 151",
    });
  }

  if (calc.startsOnHoliday) {
    const holName = getHolidayDescription(startDate) || "официальный праздник";
    results.push({
      code: "LEGAL-01-START-ON-HOLIDAY",
      kind: "legal_review",
      message: `Дата начала отпуска (${startDate}) совпадает с нерабочим праздничным днем (${holName}). По разъяснениям Минтруда РБ (S-05), начало отпуска в праздник требует специальной правовой оценки.`,
      sourceRef: "ТК РБ ст. 151, разъяснение Минтруда РБ",
    });
  }

  return {
    results,
    absenceDays: calc.absenceDays,
    leaveDays: calc.leaveDays,
    holidayDates: calc.holidayDates,
  };
}

/**
 * Checks LEGAL-02: Work year parts, total days and minimum 14-day continuous part (ст. 174 ТК РБ).
 */
export function checkWorkYearParts(
  employee: Employee,
  startDate: string,
  endDate: string,
  state: AppState,
  excludeId?: string,
): {
  results: ValidationResult[];
  parts: ContinuousPart[];
  usedAndPlannedLeaveDays: number;
  entitlementDays: number;
  remainingDays: number;
  hasFourteenDayPart: boolean;
} {
  const results: ValidationResult[] = [];

  // Find work year for employee
  const workYear = state.workYears.find(
    (wy) =>
      wy.employeeId === employee.id &&
      compareDateStr(startDate, wy.startDate) >= 0 &&
      compareDateStr(endDate, wy.endDate) <= 0,
  );

  if (!workYear) {
    results.push({
      code: "LEGAL-02-NO-WORKYEAR",
      kind: "legal_review",
      message: `Период отпуска (${startDate} — ${endDate}) выходит за границы известного рабочего года сотрудника либо кадровые данные отсутствуют. Требуется проверка HR.`,
      sourceRef: "ТК РБ ст. 174",
    });
    return {
      results,
      parts: [],
      usedAndPlannedLeaveDays: 0,
      entitlementDays: 24,
      remainingDays: 24,
      hasFourteenDayPart: false,
    };
  }

  if (!workYear.historyComplete) {
    results.push({
      code: "LEGAL-02-INCOMPLETE-HISTORY",
      kind: "legal_review",
      message:
        "История отпусков за данный рабочий год неполна. Требуется кадровое подтверждение.",
      sourceRef: "ТК РБ ст. 174",
    });
  }

  // Collect all confirmed labor leave dates for this employee in this work year
  const confirmed = getConfirmedLeaves(state, excludeId).filter(
    (c) => c.employeeId === employee.id && c.type === "labor",
  );
  const unlinkedHistory = state.existingAbsences.some(
    (a) =>
      a.employeeId === employee.id &&
      a.type === "labor" &&
      a.startDate <= workYear.endDate &&
      a.endDate >= workYear.startDate &&
      a.workYearId !== workYear.id,
  );
  if (
    unlinkedHistory ||
    confirmed.some(
      (c) =>
        c.startDate <= workYear.endDate &&
        c.endDate >= workYear.startDate &&
        (c.startDate < workYear.startDate || c.endDate > workYear.endDate),
    )
  ) {
    results.push({
      code: "LEGAL-02-HISTORY-LINK",
      kind: "legal_review",
      message: "Не подтверждена привязка части истории к рабочему году.",
    });
  }

  const allLaborDates = new Set<string>();
  for (const c of confirmed) {
    // Only within work year
    if (
      compareDateStr(c.startDate, workYear.startDate) >= 0 &&
      compareDateStr(c.endDate, workYear.endDate) <= 0
    ) {
      const dates = getDateRangeArray(c.startDate, c.endDate);
      for (const d of dates) {
        allLaborDates.add(d);
      }
    }
  }

  // Add candidate dates
  const candidateDates = getDateRangeArray(startDate, endDate);
  for (const d of candidateDates) {
    allLaborDates.add(d);
  }

  // Merge into parts
  const parts = mergeIntoContinuousParts(Array.from(allLaborDates));

  // Calculate total leave days across all parts
  let totalLeaveDays = 0;
  let hasFourteenDayPart = false;

  for (const p of parts) {
    totalLeaveDays += p.leaveDays;
    if (p.leaveDays >= 14) {
      hasFourteenDayPart = true;
    }
  }

  const entitlementDays = workYear.entitlementDays;
  const remainingDays = entitlementDays - totalLeaveDays;

  // Check 1: Exceeded total entitlement
  if (totalLeaveDays > entitlementDays) {
    results.push({
      code: "LEGAL-02-EXCEEDED-ENTITLEMENT",
      kind: "legal_block",
      actual: totalLeaveDays,
      limit: entitlementDays,
      message: `Превышено положенное количество дней трудового отпуска: запланировано ${totalLeaveDays} дн. при норме за рабочий год ${entitlementDays} дн. (превышение на ${totalLeaveDays - entitlementDays} дн.).`,
      sourceRef: "ТК РБ ст. 151, ст. 174",
    });
  }

  // Check 2: Exceeded allowed parts
  const allowedParts = workYear.allowedParts || 2;
  if (allowedParts > 2 && !workYear.partsBasisRef?.trim()) {
    results.push({
      code: "LEGAL-02-PARTS-BASIS",
      kind: "legal_review",
      message:
        "Для разделения более чем на две части отсутствует подтверждённое локальное основание.",
    });
  }
  if (parts.length > allowedParts) {
    results.push({
      code: "LEGAL-02-PARTS-LIMIT",
      kind: "legal_review",
      actual: parts.length,
      limit: allowedParts,
      message: `Разделение на ${parts.length} части превышает общее правило (допустимо ${allowedParts} части). Разделение на большее количество частей допускается только при наличии основания в коллективном договоре или ЛПА.`,
      sourceRef: "ТК РБ ст. 174",
    });
  }

  // Check 3: At least one part >= 14 days
  if (!hasFourteenDayPart) {
    const slotsRemaining = allowedParts - parts.length;
    // Can employee still take a 14-day part in future?
    if (remainingDays >= 14 && slotsRemaining > 0) {
      results.push({
        code: "LEGAL-02-MIN-PART-WARNING",
        kind: "warning",
        actual: Math.max(...parts.map((p) => p.leaveDays), 0),
        limit: 14,
        message:
          "Внимание: по ст. 174 ТК РБ при разделении отпуска одна из частей должна быть не менее 14 календарных дней. В оставшемся плане необходимо запланировать непрерывную часть не менее 14 дней.",
        sourceRef: "ТК РБ ст. 174",
      });
    } else {
      // Completed split or no days/slots left to satisfy 14 continuous days!
      results.push({
        code: "LEGAL-02-MIN-PART-BLOCKED",
        kind: "legal_block",
        actual: parts.map((p) => `${p.leaveDays} дн.`).join(" + "),
        limit: "14 дн. непрерывно",
        message: `Нарушено обязательное требование ст. 174 ТК РБ: при разделении отпуска хотя бы одна часть должна составлять не менее 14 календарных дней. Запланированные части: ${parts.map((p) => `${p.leaveDays} дн.`).join(" + ")}, и остатка дней (${remainingDays}) недостаточно для формирования обязательной 14-дневной части.`,
        sourceRef: "ТК РБ ст. 174",
      });
    }
  }

  return {
    results,
    parts,
    usedAndPlannedLeaveDays: totalLeaveDays,
    entitlementDays,
    remainingDays,
    hasFourteenDayPart,
  };
}

/**
 * Checks LEGAL-03: Special legal categories and review flag.
 */
export function checkSpecialLegalReview(
  employee: Employee,
): ValidationResult | null {
  if (employee.requiresLegalReview) {
    return {
      code: "LEGAL-03-SPECIAL-REVIEW",
      kind: "legal_review",
      message:
        "Сотрудник относится к категории с особыми условиями предоставления отпуска. Требуется отдельная правовая и кадровая проверка (корпоративное исключение недоступно).",
      sourceRef: "ТК РБ ст. 168, ст. 170 (особые категории)",
    };
  }
  return null;
}
