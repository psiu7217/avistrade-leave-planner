import { AppState, WorkYear } from "./types";
import { getDateRangeArray, isValidDateStr } from "./dates";
import { isOfficialHoliday } from "../data/holidays";

/** Annual entitlement minus recorded labor leave, not payroll accrual or compensation. */
export function getLeaveBalance(state: AppState, workYear: WorkYear) {
  const used = new Set<string>(),
    planned = new Set<string>(),
    pending = new Set<string>();
  let complete =
    workYear.historyComplete &&
    workYear.startDate.startsWith("2027-") &&
    workYear.endDate.startsWith("2027-");
  const add = (target: Set<string>, start: string, end: string) => {
    for (const day of getDateRangeArray(
      start < workYear.startDate ? workYear.startDate : start,
      end > workYear.endDate ? workYear.endDate : end,
    ))
      if (!isOfficialHoliday(day)) target.add(day);
  };
  for (const a of state.existingAbsences) {
    if (
      a.employeeId !== workYear.employeeId ||
      a.type !== "labor" ||
      a.startDate > workYear.endDate ||
      a.endDate < workYear.startDate
    )
      continue;
    if (
      a.workYearId !== workYear.id ||
      a.startDate < workYear.startDate ||
      a.endDate > workYear.endDate
    )
      complete = false;
    for (const day of getDateRangeArray(a.startDate, a.endDate)) {
      if (
        day < workYear.startDate ||
        day > workYear.endDate ||
        isOfficialHoliday(day)
      )
        continue;
      (a.phase === "used" || day < state.demoDate ? used : planned).add(day);
    }
  }
  for (const p of state.preferences) {
    if (
      p.employeeId !== workYear.employeeId ||
      p.leaveType === "unpaid" ||
      !["approved", "submitted"].includes(p.status) ||
      !isValidDateStr(p.startDate) ||
      !isValidDateStr(p.endDate) ||
      p.startDate > workYear.endDate ||
      p.endDate < workYear.startDate
    )
      continue;
    if (p.status === "submitted") add(pending, p.startDate, p.endDate);
    else {
      if (p.startDate < workYear.startDate || p.endDate > workYear.endDate)
        complete = false;
      for (const day of getDateRangeArray(p.startDate, p.endDate))
        if (
          day >= workYear.startDate &&
          day <= workYear.endDate &&
          !isOfficialHoliday(day)
        )
          (day < state.demoDate ? used : planned).add(day);
    }
  }
  used.forEach((d) => planned.delete(d));
  [...used, ...planned].forEach((d) => pending.delete(d));
  const rawRemaining = workYear.entitlementDays - used.size - planned.size;
  return {
    workYear,
    complete,
    used: used.size,
    planned: planned.size,
    pending: pending.size,
    unused: complete ? Math.max(0, workYear.entitlementDays - used.size) : null,
    remaining: complete ? Math.max(0, rawRemaining) : null,
    overplanned: complete ? Math.max(0, -rawRemaining) : null,
    plannedDates: [...planned].sort(),
  };
}

export function getEmployeeBalances(
  state: AppState,
  employeeId: string,
  year: number,
) {
  const years = state.workYears.filter((w) => w.employeeId === employeeId);
  return state.workYears
    .filter(
      (w) =>
        w.employeeId === employeeId &&
        w.startDate <= `${year}-12-31` &&
        w.endDate >= `${year}-01-01`,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((w) => {
      const balance = getLeaveBalance(state, w);
      if (
        years.some(
          (other) =>
            other.id !== w.id &&
            other.startDate <= w.endDate &&
            other.endDate >= w.startDate,
        )
      )
        return {
          ...balance,
          complete: false,
          unused: null,
          remaining: null,
          overplanned: null,
        };
      return balance;
    });
}

export function daysUntil(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

export function getDeadlineRows(state: AppState, year: number, threshold = 90) {
  return state.employees
    .filter((e) => e.active)
    .map((employee) => {
      const balances = getEmployeeBalances(state, employee.id, year);
      const contractDays = employee.contractEndDate
        ? daysUntil(state.demoDate, employee.contractEndDate)
        : null;
      const urgentContract = contractDays !== null && contractDays <= threshold;
      const urgentWorkYear = balances.some(
        (b) =>
          daysUntil(state.demoDate, b.workYear.endDate) <= threshold &&
          (b.remaining === null || b.remaining > 0),
      );
      const needsCheck = !balances.length || balances.some((b) => !b.complete);
      const hasUnplanned = balances.some(
        (b) => b.remaining !== null && b.remaining > 0,
      );
      // A planned leave after the contract date does not remove the contract alert.
      const scheduledAfterContract = balances.reduce(
        (sum, b) =>
          sum +
          b.plannedDates.filter(
            (d) => employee.contractEndDate && d > employee.contractEndDate,
          ).length,
        0,
      );
      return {
        employee,
        balances,
        contractDays,
        urgent:
          (urgentContract &&
            (hasUnplanned || scheduledAfterContract > 0 || needsCheck)) ||
          urgentWorkYear,
        needsCheck,
        scheduledAfterContract,
      };
    })
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        (a.contractDays ?? Infinity) - (b.contractDays ?? Infinity) ||
        a.employee.name.localeCompare(b.employee.name, "ru"),
    );
}
