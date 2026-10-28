/**
 * Persistence service for LeaveFlow v2.0
 * Conforms to Section 11.4 of the Technical Specification.
 */

import { INITIAL_STATE, STORAGE_KEY } from "../data/seed";
import { AppState } from "../domain/types";
import { isValidDateStr } from "../domain/dates";

export function loadSavedState(): {
  state: AppState;
  isCorrupted: boolean;
  error?: string;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: cloneInitialState(), isCorrupted: false };
    }

    const parsed = JSON.parse(raw) as AppState;
    if (!isAppState(parsed)) {
      return {
        state: cloneInitialState(),
        isCorrupted: true,
        error:
          "Версия сохраненных данных устарела. Рекомендуется сбросить демо-данные к исходному состоянию.",
      };
    }

    return { state: parsed, isCorrupted: false };
  } catch (err) {
    return {
      state: cloneInitialState(),
      isCorrupted: true,
      error:
        "Не удалось прочитать локальное хранилище. Рекомендуется сбросить данные к исходным.",
    };
  }
}

export function saveCurrentState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error("LocalStorage write failed:", err);
    return false;
  }
}

export function resetStoredState(): AppState {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("LocalStorage removeItem failed:", err);
  }
  return cloneInitialState();
}

export function cloneInitialState(): AppState {
  return JSON.parse(JSON.stringify(INITIAL_STATE));
}

export function isAppState(value: unknown): value is AppState {
  const s = value as AppState;
  if (
    !s ||
    s.schemaVersion !== INITIAL_STATE.schemaVersion ||
    ![
      "employees",
      "departments",
      "incompatibilityPairs",
      "preferences",
      "existingAbsences",
      "workYears",
      "exceptions",
      "auditEvents",
    ].every((k) => Array.isArray((s as any)[k]))
  )
    return false;
  if (
    !s.employees.length ||
    !s.corporateRules ||
    s.demoDate !== INITIAL_STATE.demoDate ||
    s.currentYear !== 2027
  )
    return false;
  const ids = new Set(s.employees.map((e) => e?.id));
  if (
    ids.size !== s.employees.length ||
    !s.employees.every(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        (e.contractEndDate === undefined ||
          isValidDateStr(e.contractEndDate)) &&
        Array.isArray(e.accessRoles),
    )
  )
    return false;
  if (!s.employees.some((e) => e.active && e.accessRoles.includes("hr")))
    return false;
  if (
    !["salesMaxConcurrent", "summerMaxDays", "noticeMonths"].every(
      (code) =>
        s.corporateRules[code] &&
        Number.isInteger(s.corporateRules[code].value) &&
        s.corporateRules[code].version >= 1,
    )
  )
    return false;
  const prefIds = new Set(s.preferences.map((p) => p?.id));
  return (
    prefIds.size === s.preferences.length &&
    s.preferences.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        (p.leaveType === undefined ||
          ["labor", "unpaid"].includes(p.leaveType)) &&
        (p.unpaidReason === undefined ||
          ["personal", "study"].includes(p.unpaidReason)) &&
        (p.unpaidApprovalBasis === undefined ||
          typeof p.unpaidApprovalBasis === "string") &&
        ids.has(p.employeeId) &&
        typeof p.startDate === "string" &&
        typeof p.endDate === "string" &&
        [
          "draft",
          "returned",
          "submitted",
          "approved",
          "rejected",
          "withdrawn",
        ].includes(p.status) &&
        (["draft", "returned"].includes(p.status) ||
          (isValidDateStr(p.startDate) &&
            isValidDateStr(p.endDate) &&
            p.startDate <= p.endDate)),
    ) &&
    s.existingAbsences.every(
      (a) =>
        a &&
        ids.has(a.employeeId) &&
        isValidDateStr(a.startDate) &&
        isValidDateStr(a.endDate) &&
        a.startDate <= a.endDate,
    ) &&
    s.workYears.every(
      (w) =>
        w &&
        ids.has(w.employeeId) &&
        Number.isFinite(w.entitlementDays) &&
        isValidDateStr(w.startDate) &&
        isValidDateStr(w.endDate),
    ) &&
    s.auditEvents.every(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.action === "string" &&
        typeof e.createdAt === "string",
    ) &&
    s.exceptions.every(
      (e) =>
        e &&
        typeof e.id === "string" &&
        prefIds.has(e.preferenceId) &&
        Array.isArray(e.violationsSnapshot) &&
        typeof e.reason === "string" &&
        e.ruleVersions,
    ) &&
    s.incompatibilityPairs.every(
      (p) => p && ids.has(p.employeeAId) && ids.has(p.employeeBId),
    )
  );
}
