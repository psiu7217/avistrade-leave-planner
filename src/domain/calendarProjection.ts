/**
 * Calendar projection utilities for month grid, day occupancy, and horizon boundaries.
 */

import { AppState, Employee, Horizon, Preference } from "./types";
import {
  areIntervalsOverlapping,
  compareDateStr,
  isSummerDate,
  pad2,
  parseYMD,
} from "./dates";
import { getHolidayDescription, isOfficialHoliday } from "../data/holidays";
import {
  getConfirmedLeaves,
  checkSalesConcurrentLimit,
  checkIncompatiblePairs,
} from "./corporateRules";

export interface CalendarDayCell {
  dateStr: string;
  dayNumber: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isPast: boolean;
  isSummer: boolean;
}

export function getMonthCalendarGrid(
  year: number,
  month: number, // 1-12
  demoDate: string = "2026-10-28",
): CalendarDayCell[][] {
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Day of week for 1st of month: 0 (Sun) .. 6 (Sat)
  // Russian calendar starts on Monday (1..7, where Sunday is 7)
  let startDayOfWeek = firstDayOfMonth.getUTCDay();
  if (startDayOfWeek === 0) startDayOfWeek = 7; // Monday = 1, Sunday = 7

  const weeks: CalendarDayCell[][] = [];
  let currentWeek: CalendarDayCell[] = [];

  // Previous month trailing days
  const prevMonthLastDate = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  for (let i = startDayOfWeek - 1; i > 0; i--) {
    const dNum = prevMonthLastDate - i + 1;
    const dateStr = `${prevYear}-${pad2(prevMonth)}-${pad2(dNum)}`;
    const dayOfWeek = (startDayOfWeek - i) % 7;
    const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;
    const isHoliday = isOfficialHoliday(dateStr) === true;

    currentWeek.push({
      dateStr,
      dayNumber: dNum,
      month: prevMonth,
      year: prevYear,
      isCurrentMonth: false,
      isWeekend,
      isHoliday,
      holidayName: getHolidayDescription(dateStr),
      isPast: compareDateStr(dateStr, demoDate) < 0,
      isSummer: isSummerDate(dateStr),
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    const dayDate = new Date(Date.UTC(year, month - 1, d));
    let dayOfWeek = dayDate.getUTCDay();
    if (dayOfWeek === 0) dayOfWeek = 7;
    const isWeekend = dayOfWeek === 6 || dayOfWeek === 7;
    const isHoliday = isOfficialHoliday(dateStr) === true;

    currentWeek.push({
      dateStr,
      dayNumber: d,
      month,
      year,
      isCurrentMonth: true,
      isWeekend,
      isHoliday,
      holidayName: getHolidayDescription(dateStr),
      isPast: compareDateStr(dateStr, demoDate) < 0,
      isSummer: isSummerDate(dateStr),
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Next month leading days to complete grid
  if (currentWeek.length > 0) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    let nextD = 1;
    while (currentWeek.length < 7) {
      const dateStr = `${nextYear}-${pad2(nextMonth)}-${pad2(nextD)}`;
      const dayDate = new Date(Date.UTC(nextYear, nextMonth - 1, nextD));
      let dayOfWeek = dayDate.getUTCDay();
      if (dayOfWeek === 0) dayOfWeek = 7;
      const isWeekend = dayOfWeek === 6 || dayOfWeek === 7;
      const isHoliday = isOfficialHoliday(dateStr) === true;

      currentWeek.push({
        dateStr,
        dayNumber: nextD,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
        isWeekend,
        isHoliday,
        holidayName: getHolidayDescription(dateStr),
        isPast: compareDateStr(dateStr, demoDate) < 0,
        isSummer: isSummerDate(dateStr),
      });
      nextD++;
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

export function getHorizonDateRange(
  year: number,
  horizon: Horizon,
): { start: string; end: string } {
  if (horizon === "H1") {
    return { start: `${year}-01-01`, end: `${year}-06-30` };
  } else if (horizon === "H2") {
    return { start: `${year}-07-01`, end: `${year}-12-31` };
  } else {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
}

export function getMonthsForHorizon(horizon: Horizon): number[] {
  if (horizon === "H1") return [1, 2, 3, 4, 5, 6];
  if (horizon === "H2") return [7, 8, 9, 10, 11, 12];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

/**
 * For Employee calendar projection: returns anonymous summary for dateStr.
 * Never reveals colleague names, reasons or personal details!
 */
export function getEmployeeDateSummary(
  employeeId: string,
  dateStr: string,
  state: AppState,
): {
  myStatus:
    | "approved"
    | "approved_exception"
    | "submitted"
    | "returned"
    | "draft"
    | null;
  myPreferenceId?: string;
  hasColleagueConfirmedAbsence: boolean;
  colleagueConfirmedCount: number;
  hasColleaguePending: boolean;
  colleaguePendingCount: number;
} {
  // Check employee's own items
  let myStatus:
    | "approved"
    | "approved_exception"
    | "submitted"
    | "returned"
    | "draft"
    | null = null;
  let myPreferenceId: string | undefined;

  // Check existing absences of self
  const ownAbs = state.existingAbsences.find(
    (a) =>
      a.employeeId === employeeId &&
      areIntervalsOverlapping(a.startDate, a.endDate, dateStr, dateStr),
  );
  if (ownAbs) {
    myStatus = "approved";
    myPreferenceId = ownAbs.id;
  }

  // Check preferences of self
  const ownPref = [...state.preferences]
    .sort(
      (a, b) =>
        ["approved", "submitted", "returned", "draft"].indexOf(a.status) -
        ["approved", "submitted", "returned", "draft"].indexOf(b.status),
    )
    .find(
      (p) =>
        p.employeeId === employeeId &&
        p.status !== "withdrawn" &&
        p.status !== "rejected" &&
        areIntervalsOverlapping(p.startDate, p.endDate, dateStr, dateStr),
    );

  if (ownPref && !ownAbs) {
    if (ownPref.status === "approved") {
      myStatus = ownPref.isException ? "approved_exception" : "approved";
    } else if (ownPref.status === "submitted") {
      myStatus = "submitted";
    } else if (ownPref.status === "returned") {
      myStatus = "returned";
    } else if (ownPref.status === "draft") {
      myStatus = "draft";
    }
    myPreferenceId = ownPref.id;
  }

  // Check colleagues' confirmed absences (anonymous count)
  const employee = state.employees.find((e) => e.id === employeeId);
  const salesConflict =
    employee &&
    state.corporateRules.salesMaxConcurrent &&
    checkSalesConcurrentLimit(
      employee,
      dateStr,
      dateStr,
      state,
      state.corporateRules.salesMaxConcurrent,
    );
  const pairConflicts = checkIncompatiblePairs(
    employeeId,
    dateStr,
    dateStr,
    state,
  );
  const conflictingIds = new Set([
    ...(salesConflict?.conflictingEmployeeIds ?? []),
    ...pairConflicts.flatMap((r) => r.conflictingEmployeeIds ?? []),
  ]);
  const confirmed = getConfirmedLeaves(state).filter(
    (c) =>
      conflictingIds.has(c.employeeId) &&
      areIntervalsOverlapping(c.startDate, c.endDate, dateStr, dateStr),
  );
  const uniqueConfirmedColleagues = new Set(confirmed.map((c) => c.employeeId));

  // Check colleagues' submitted preferences (anonymous count)
  const pending = state.preferences.filter(
    (p) =>
      p.employeeId !== employeeId &&
      ((employee?.positionCode === "MPP" &&
        state.employees.find((e) => e.id === p.employeeId)?.positionCode ===
          "MPP") ||
        state.incompatibilityPairs.some(
          (pair) =>
            (pair.employeeAId === employeeId &&
              pair.employeeBId === p.employeeId) ||
            (pair.employeeBId === employeeId &&
              pair.employeeAId === p.employeeId),
        )) &&
      p.status === "submitted" &&
      areIntervalsOverlapping(p.startDate, p.endDate, dateStr, dateStr),
  );
  const uniquePendingColleagues = new Set(pending.map((p) => p.employeeId));

  return {
    myStatus,
    myPreferenceId,
    hasColleagueConfirmedAbsence: uniqueConfirmedColleagues.size > 0,
    colleagueConfirmedCount: uniqueConfirmedColleagues.size,
    hasColleaguePending: uniquePendingColleagues.size > 0,
    colleaguePendingCount: uniquePendingColleagues.size,
  };
}
