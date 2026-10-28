import { AppState, Employee, Horizon, Preference } from "./types";
import {
  areIntervalsOverlapping,
  calculateLeaveDays,
  formatDateRangeRu,
  getDateRangeArray,
  isValidDateStr,
} from "./dates";
import { getHorizonDateRange } from "./calendarProjection";
import { getConfirmedLeaves } from "./corporateRules";

export type PlanningStatus = "missing" | "returned" | "pending" | "planned";
export const PLANNING_LABELS: Record<PlanningStatus, string> = {
  missing: "Нет полученных дат",
  returned: "Ждём корректировку",
  pending: "Ждут решения HR",
  planned: "Есть согласованные даты",
};
export interface PlanningRow {
  employee: Employee;
  manager?: Employee;
  statuses: PlanningStatus[];
  approvedDays: number;
  submittedCount: number;
  returnedCount: number;
  requestIds: string[];
  needsEmployeeResponse: boolean;
}

/** A roster, not a request list: people with no submissions must remain visible.
 * Draft contents never influence HR's view. A partial plan is never called complete.
 */
export function getPlanningRoster(
  state: AppState,
  year: number,
  horizon: Horizon,
): PlanningRow[] {
  const range = getHorizonDateRange(year, horizon);
  const intersects = (p: { startDate: string; endDate: string }) =>
    isValidDateStr(p.startDate) &&
    isValidDateStr(p.endDate) &&
    areIntervalsOverlapping(p.startDate, p.endDate, range.start, range.end);
  return state.employees
    .filter((e) => e.active)
    .map((employee) => {
      const prefs = state.preferences.filter(
        (p) =>
          p.employeeId === employee.id &&
          p.leaveType !== "unpaid" &&
          ["submitted", "returned", "approved"].includes(p.status) &&
          intersects(p),
      );
      const approved = [
        ...state.existingAbsences.filter(
          (a) =>
            a.employeeId === employee.id && a.type === "labor" && intersects(a),
        ),
        ...prefs.filter((p) => p.status === "approved"),
      ];
      const days = new Set(
        approved.flatMap((p) =>
          getDateRangeArray(
            p.startDate < range.start ? range.start : p.startDate,
            p.endDate > range.end ? range.end : p.endDate,
          ),
        ),
      );
      const submittedCount = prefs.filter(
        (p) => p.status === "submitted",
      ).length;
      const returnedCount = prefs.filter((p) => p.status === "returned").length;
      const statuses: PlanningStatus[] = [];
      if (!approved.length && !prefs.length) statuses.push("missing");
      if (returnedCount) statuses.push("returned");
      if (submittedCount) statuses.push("pending");
      if (approved.length) statuses.push("planned");
      const approvedDays = [...days].filter(
        (d) => calculateLeaveDays(d, d).leaveDays > 0,
      ).length;
      return {
        employee,
        manager: state.employees.find((e) => e.id === employee.managerId),
        statuses,
        approvedDays,
        submittedCount,
        returnedCount,
        requestIds: prefs
          .filter((p) => p.status === "submitted" || p.status === "returned")
          .map((p) => p.id),
        needsEmployeeResponse:
          statuses.includes("missing") || returnedCount > 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.needsEmployeeResponse) - Number(a.needsEmployeeResponse) ||
        a.employee.name.localeCompare(b.employee.name, "ru"),
    );
}

export function planningPeriodLabel(year: number, horizon: Horizon) {
  return horizon === "ALL"
    ? `${year} год`
    : `${horizon === "H1" ? "I" : "II"} полугодие ${year} года`;
}
export function buildPlanningReminder(
  rows: PlanningRow[],
  year: number,
  horizon: Horizon,
): string {
  const relevant = rows.filter((r) => r.needsEmployeeResponse);
  const period = planningPeriodLabel(year, horizon);
  if (!relevant.length)
    return `По выбранному списку за ${period} нет сотрудников, у которых нужно запросить даты или корректировку. Пожелания на рассмотрении остаются задачей HR.`;
  return [
    `Коллеги, собираем предпочтительные даты отпусков на ${period}.`,
    "Просьба предложить даты в LeaveFlow либо исправить возвращённое пожелание:",
    ...relevant.map(
      (r) =>
        `• ${r.employee.name} — ${r.returnedCount ? "нужна корректировка возвращённого пожелания" : "даты пока не получены"}${r.manager ? `; руководитель: ${r.manager.name}` : ""}.`,
    ),
    "Отправка пожелания не означает согласования отпуска. Если даты ещё неизвестны, сообщите об этом HR.",
  ].join("\n");
}

export type CoverageRiskKind = "overload" | "potential" | "unavailable";
export interface CoverageRisk {
  id: string;
  kind: CoverageRiskKind;
  replacementEmployeeId: string;
  startDate: string;
  endDate: string;
  confirmedEmployeeIds: string[];
  pendingEmployeeIds: string[];
  requestIds: string[];
}
export const COVERAGE_LABELS: Record<CoverageRiskKind, string> = {
  overload: "Несколько согласованных замещений",
  potential: "Возможное двойное замещение",
  unavailable: "Замещающий сам отсутствует",
};

/** An operational signal, not a new policy limit or an estimate of FTE/workload.
 * Submitted requests are labelled potential; they never reserve capacity.
 */
export function getCoverageRisks(
  state: AppState,
  year: number,
  horizon: Horizon,
): CoverageRisk[] {
  const range = getHorizonDateRange(year, horizon);
  const assignments = state.preferences.filter(
    (p) =>
      ["submitted", "approved"].includes(p.status) &&
      p.replacementEmployeeId &&
      p.replacementEmployeeId !== p.employeeId &&
      state.employees.some((e) => e.id === p.employeeId && e.active) &&
      state.employees.some(
        (e) => e.id === p.replacementEmployeeId && e.active,
      ) &&
      isValidDateStr(p.startDate) &&
      isValidDateStr(p.endDate) &&
      areIntervalsOverlapping(p.startDate, p.endDate, range.start, range.end),
  );
  const absences = getConfirmedLeaves(state);
  const risks: CoverageRisk[] = [];
  const previousBySignature = new Map<string, CoverageRisk>();
  for (const date of getDateRangeArray(range.start, range.end)) {
    const byBackup = new Map<string, Preference[]>();
    for (const p of assignments)
      if (p.startDate <= date && p.endDate >= date)
        byBackup.set(p.replacementEmployeeId, [
          ...(byBackup.get(p.replacementEmployeeId) ?? []),
          p,
        ]);
    for (const [replacementEmployeeId, items] of byBackup) {
      const confirmedEmployeeIds = [
        ...new Set(
          items.filter((p) => p.status === "approved").map((p) => p.employeeId),
        ),
      ].sort();
      const pendingEmployeeIds = [
        ...new Set(
          items
            .filter((p) => p.status === "submitted")
            .map((p) => p.employeeId),
        ),
      ]
        .filter((id) => !confirmedEmployeeIds.includes(id))
        .sort();
      const requestIds = items.map((p) => p.id).sort();
      const kinds: CoverageRiskKind[] = [];
      if (confirmedEmployeeIds.length >= 2) kinds.push("overload");
      else if (confirmedEmployeeIds.length + pendingEmployeeIds.length >= 2)
        kinds.push("potential");
      if (
        absences.some(
          (a) =>
            a.employeeId === replacementEmployeeId &&
            a.startDate <= date &&
            a.endDate >= date,
        )
      )
        kinds.push("unavailable");
      for (const kind of kinds) {
        const signature = JSON.stringify({
          replacementEmployeeId,
          kind,
          confirmedEmployeeIds,
          pendingEmployeeIds,
          requestIds,
        });
        const previous = previousBySignature.get(signature);
        if (previous && getDateRangeArray(previous.endDate, date).length === 2)
          previous.endDate = date;
        else {
          const risk: CoverageRisk = {
            id: `${replacementEmployeeId}:${kind}:${date}:${requestIds.join(",")}`,
            kind,
            replacementEmployeeId,
            startDate: date,
            endDate: date,
            confirmedEmployeeIds,
            pendingEmployeeIds,
            requestIds,
          };
          risks.push(risk);
          previousBySignature.set(signature, risk);
        }
      }
    }
  }
  return risks.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.replacementEmployeeId.localeCompare(b.replacementEmployeeId),
  );
}

export function describeCoverageRisk(
  risk: CoverageRisk,
  state: AppState,
): string {
  const name = (id: string) =>
    state.employees.find((e) => e.id === id)?.name ?? "Неизвестный сотрудник";
  return (
    `${name(risk.replacementEmployeeId)} · ${formatDateRangeRu(risk.startDate, risk.endDate)}. ${COVERAGE_LABELS[risk.kind]}. ` +
    (risk.confirmedEmployeeIds.length
      ? `Согласовано замещение: ${risk.confirmedEmployeeIds.map(name).join(", ")}. `
      : "") +
    (risk.pendingEmployeeIds.length
      ? `Ещё на рассмотрении: ${risk.pendingEmployeeIds.map(name).join(", ")}.`
      : "")
  );
}
