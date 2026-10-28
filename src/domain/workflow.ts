/**
 * Workflow and State Reducer for LeaveFlow v2.0
 * Conforms to Section 5, 8, 9, 11 of the Technical Specification.
 */

import {
  AppState,
  AuditEvent,
  CorporateRule,
  ExceptionRecord,
  Preference,
  ValidationResult,
} from "./types";
import {
  validatePreference,
  validationFingerprint,
} from "./validatePreference";

export type AppAction =
  | {
      type: "SAVE_DRAFT";
      payload: {
        id?: string;
        employeeId: string;
        startDate: string;
        endDate: string;
        replacementEmployeeId: string;
        comment: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "SUBMIT_PREFERENCE";
      payload: {
        id?: string;
        employeeId: string;
        startDate: string;
        endDate: string;
        replacementEmployeeId: string;
        comment: string;
        acknowledgedCodes?: string[];
        acknowledgedFingerprint?: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "WITHDRAW_PREFERENCE";
      payload: {
        preferenceId: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "APPROVE_PREFERENCE";
      payload: {
        preferenceId: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "APPROVE_EXCEPTION";
      payload: {
        preferenceId: string;
        reason: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "RETURN_PREFERENCE";
      payload: {
        preferenceId: string;
        reason: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "REJECT_PREFERENCE";
      payload: {
        preferenceId: string;
        reason: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "UPDATE_RULE";
      payload: {
        code: string;
        newValue: number;
        reason: string;
      };
      actorId: string;
      actorName: string;
    }
  | {
      type: "RESET_STATE";
      payload: {
        initialState: AppState;
      };
      actorId: string;
      actorName: string;
    };

export function appReducer(state: AppState, action: AppAction): AppState {
  const nowIso = new Date().toISOString();
  const actor = state.employees.find(
    (e) => e.id === action.actorId && e.active,
  );
  if (!actor) throw new Error("Действующий пользователь не найден.");
  const hrAction = [
    "APPROVE_PREFERENCE",
    "APPROVE_EXCEPTION",
    "RETURN_PREFERENCE",
    "REJECT_PREFERENCE",
    "UPDATE_RULE",
  ].includes(action.type);
  if (hrAction && !actor.accessRoles.includes("hr"))
    throw new Error("Действие доступно только HR.");
  if (action.type === "SAVE_DRAFT" || action.type === "SUBMIT_PREFERENCE") {
    const { id, employeeId } = action.payload;
    const existing = id
      ? state.preferences.find((p) => p.id === id)
      : undefined;
    if (actor.id !== employeeId && !actor.accessRoles.includes("hr"))
      throw new Error("Нельзя изменять пожелание другого сотрудника.");
    if (
      id &&
      (!existing ||
        existing.employeeId !== employeeId ||
        !["draft", "returned"].includes(existing.status))
    ) {
      throw new Error(
        "Редактировать можно только собственный черновик или возвращённое пожелание.",
      );
    }
  }
  if (
    action.type === "WITHDRAW_PREFERENCE" &&
    state.preferences.find((p) => p.id === action.payload.preferenceId)
      ?.employeeId !== actor.id
  ) {
    throw new Error("Можно отозвать только собственное пожелание.");
  }
  const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
  const ruleVersions = Object.fromEntries(
    Object.values(state.corporateRules).map((r) => [r.code, r.version]),
  );

  switch (action.type) {
    case "SAVE_DRAFT": {
      const {
        id,
        employeeId,
        startDate,
        endDate,
        replacementEmployeeId,
        comment,
      } = action.payload;
      const existing = id ? state.preferences.find((p) => p.id === id) : null;

      const targetId = id || newId("pref");
      const updatedPref: Preference = {
        id: targetId,
        employeeId,
        startDate,
        endDate,
        replacementEmployeeId,
        comment,
        status: existing?.status === "returned" ? "returned" : "draft",
        returnReason: existing?.returnReason,
        revision: existing ? existing.revision + 1 : 1,
        createdAt: existing ? existing.createdAt : nowIso,
        updatedAt: nowIso,
      };

      const newPrefs = existing
        ? state.preferences.map((p) => (p.id === targetId ? updatedPref : p))
        : [updatedPref, ...state.preferences];

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "SAVE_DRAFT",
        entityId: targetId,
        summary: `Сохранен черновик отпуска (${startDate} — ${endDate})`,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: newPrefs,
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "SUBMIT_PREFERENCE": {
      const {
        id,
        employeeId,
        startDate,
        endDate,
        replacementEmployeeId,
        comment,
        acknowledgedCodes,
        acknowledgedFingerprint,
      } = action.payload;

      const candidate = {
        id,
        employeeId,
        startDate,
        endDate,
        replacementEmployeeId,
        comment,
        submittedAt: nowIso,
        submittedOn: state.demoDate,
      };

      const validation = validatePreference(
        candidate,
        state,
        state.demoDate,
        id,
      );
      if (validation.hasInputErrors) {
        throw new Error(
          validation.results.find((r) => r.kind === "input_error")?.message ||
            "Ошибка в данных пожелания",
        );
      }

      if (
        validation.requiresAcknowledgement &&
        (acknowledgedFingerprint !== validationFingerprint(validation, state) ||
          validation.results
            .filter((r) => r.kind !== "input_error")
            .some((r) => !acknowledgedCodes?.includes(r.code)))
      ) {
        throw new Error(
          "Проверки изменились. Ознакомьтесь с актуальными ограничениями и подтвердите их заново.",
        );
      }

      const existing = id ? state.preferences.find((p) => p.id === id) : null;
      const targetId = id || newId("pref");

      const updatedPref: Preference = {
        id: targetId,
        employeeId,
        startDate,
        endDate,
        replacementEmployeeId,
        comment,
        status: "submitted",
        revision: existing ? existing.revision + 1 : 1,
        createdAt: existing ? existing.createdAt : nowIso,
        updatedAt: nowIso,
        submittedAt: nowIso,
        submittedOn: state.demoDate,
        acknowledgement: validation.requiresAcknowledgement
          ? {
              confirmedBy: actor.id,
              preferenceRevision: existing ? existing.revision + 1 : 1,
              confirmedAt: nowIso,
              confirmedCodes: validation.results.map((r) => r.code),
              rulesFingerprint: validationFingerprint(validation, state),
            }
          : undefined,
        returnReason: undefined,
        rejectionReason: undefined,
      };

      const newPrefs = existing
        ? state.preferences.map((p) => (p.id === targetId ? updatedPref : p))
        : [updatedPref, ...state.preferences];

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "SUBMIT_PREFERENCE",
        entityId: targetId,
        summary: `Подано пожелание на отпуск (${startDate} — ${endDate})${
          validation.requiresAcknowledgement
            ? " с подтверждением конфликта"
            : ""
        }`,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: newPrefs,
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "WITHDRAW_PREFERENCE": {
      const target = state.preferences.find(
        (p) => p.id === action.payload.preferenceId,
      );
      if (!target || target.status !== "submitted") {
        return state;
      }

      const updated: Preference = {
        ...target,
        status: "withdrawn",
        updatedAt: nowIso,
      };

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "WITHDRAW_PREFERENCE",
        entityId: target.id,
        summary: `Пожелание отпуска (${target.startDate} — ${target.endDate}) отозвано сотрудником`,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: state.preferences.map((p) =>
          p.id === target.id ? updated : p,
        ),
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "APPROVE_PREFERENCE": {
      const target = state.preferences.find(
        (p) => p.id === action.payload.preferenceId,
      );
      if (!target || target.status !== "submitted") {
        throw new Error("Пожелание не найдено или не ожидает рассмотрения");
      }

      // Re-validate against current state
      const validation = validatePreference(
        target,
        state,
        state.demoDate,
        target.id,
      );
      if (!validation.canApproveNormally) {
        throw new Error(
          "Обычное согласование невозможно: имеются корпоративные конфликты или правовые ограничения.",
        );
      }

      const updated: Preference = {
        ...target,
        status: "approved",
        isException: false,
        approvedRuleVersions: ruleVersions,
        updatedAt: nowIso,
      };

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "APPROVE_PREFERENCE",
        entityId: target.id,
        summary: `Пожелание (${target.startDate} — ${target.endDate}) согласовано в рабочем плане`,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: state.preferences.map((p) =>
          p.id === target.id ? updated : p,
        ),
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "APPROVE_EXCEPTION": {
      const { preferenceId, reason } = action.payload;
      const cleanReason = (reason || "").trim();
      if (cleanReason.length < 10) {
        throw new Error(
          "Основание для корпоративного исключения должно содержать не менее 10 символов.",
        );
      }

      const target = state.preferences.find((p) => p.id === preferenceId);
      if (!target || target.status !== "submitted") {
        throw new Error("Пожелание не найдено или не ожидает рассмотрения");
      }

      // Re-validate against current state
      const validation = validatePreference(
        target,
        state,
        state.demoDate,
        target.id,
      );
      if (!validation.canApproveAsException) {
        throw new Error(
          "Юридические блокировки и проверки ТК РБ не могут быть обойдены корпоративным исключением.",
        );
      }
      if (!validation.hasCorporateConflicts) {
        throw new Error(
          "Корпоративных конфликтов не выявлено — используйте стандартное согласование.",
        );
      }

      const exceptionRecord: ExceptionRecord = {
        id: `exc-${crypto.randomUUID()}`,
        preferenceId: target.id,
        preferenceRevision: target.revision,
        violationsSnapshot: validation.results.filter(
          (r) => r.kind === "corporate_conflict",
        ),
        ruleVersions: {
          salesMaxConcurrent:
            state.corporateRules.salesMaxConcurrent?.version || 1,
          summerMaxDays: state.corporateRules.summerMaxDays?.version || 1,
          noticeMonths: state.corporateRules.noticeMonths?.version || 1,
        },
        reason: cleanReason,
        approvedBy: action.actorId,
        createdAt: nowIso,
      };

      const updated: Preference = {
        ...target,
        status: "approved",
        isException: true,
        approvedRuleVersions: ruleVersions,
        exceptionId: exceptionRecord.id,
        updatedAt: nowIso,
      };

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "APPROVE_EXCEPTION",
        entityId: target.id,
        summary: `Согласовано корпоративное исключение на даты ${target.startDate} — ${target.endDate}. Основание: ${cleanReason}`,
        comment: cleanReason,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: state.preferences.map((p) =>
          p.id === target.id ? updated : p,
        ),
        exceptions: [exceptionRecord, ...state.exceptions],
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "RETURN_PREFERENCE": {
      const { preferenceId, reason } = action.payload;
      const cleanReason = (reason || "").trim();
      if (!cleanReason) {
        throw new Error("Укажите причину возврата на корректировку.");
      }

      const target = state.preferences.find((p) => p.id === preferenceId);
      if (!target || target.status !== "submitted") {
        throw new Error("Пожелание не найдено или не ожидает рассмотрения");
      }

      const updated: Preference = {
        ...target,
        status: "returned",
        returnReason: cleanReason,
        updatedAt: nowIso,
      };

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "RETURN_PREFERENCE",
        entityId: target.id,
        summary: `Пожелание возвращено сотруднику на корректировку: "${cleanReason}"`,
        comment: cleanReason,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: state.preferences.map((p) =>
          p.id === target.id ? updated : p,
        ),
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "REJECT_PREFERENCE": {
      const { preferenceId, reason } = action.payload;
      const cleanReason = (reason || "").trim();
      if (!cleanReason) {
        throw new Error("Укажите причину отклонения пожелания.");
      }

      const target = state.preferences.find((p) => p.id === preferenceId);
      if (!target || target.status !== "submitted") {
        throw new Error("Пожелание не найдено или не ожидает рассмотрения");
      }

      const updated: Preference = {
        ...target,
        status: "rejected",
        rejectionReason: cleanReason,
        updatedAt: nowIso,
      };

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "REJECT_PREFERENCE",
        entityId: target.id,
        summary: `Пожелание отклонено HR: "${cleanReason}"`,
        comment: cleanReason,
        createdAt: nowIso,
      };

      return {
        ...state,
        preferences: state.preferences.map((p) =>
          p.id === target.id ? updated : p,
        ),
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "UPDATE_RULE": {
      const { code, newValue, reason } = action.payload;
      const cleanReason = (reason || "").trim();
      if (cleanReason.length < 10) {
        throw new Error(
          "Основание для изменения корпоративного правила должно содержать не менее 10 символов.",
        );
      }

      const currentRule = state.corporateRules[code];
      if (!currentRule) {
        throw new Error(`Правило с кодом ${code} не найдено.`);
      }
      const max =
        code === "salesMaxConcurrent"
          ? state.employees.filter((e) => e.active && e.positionCode === "MPP")
              .length
          : code === "summerMaxDays"
            ? 92
            : 6;
      const min = code === "noticeMonths" ? 0 : 1;
      if (
        !["salesMaxConcurrent", "summerMaxDays", "noticeMonths"].includes(
          code,
        ) ||
        !Number.isInteger(newValue) ||
        newValue < min ||
        newValue > max
      ) {
        throw new Error(`Укажите целое значение от ${min} до ${max}.`);
      }
      if (newValue === currentRule.value)
        throw new Error("Значение правила не изменилось.");

      const updatedRule: CorporateRule = {
        ...currentRule,
        value: newValue,
        version: currentRule.version + 1,
        updatedAt: nowIso,
        updatedBy: action.actorId,
      };

      const audit: AuditEvent = {
        id: `audit-${crypto.randomUUID()}`,
        actorId: action.actorId,
        actorName: action.actorName,
        action: "UPDATE_RULE",
        entityId: code,
        summary: `Изменен параметр "${currentRule.name}": было ${currentRule.value}, стало ${newValue} (версия v${updatedRule.version}). Основание: ${cleanReason}`,
        comment: cleanReason,
        createdAt: nowIso,
      };

      return {
        ...state,
        corporateRules: {
          ...state.corporateRules,
          [code]: updatedRule,
        },
        auditEvents: [audit, ...state.auditEvents],
      };
    }

    case "RESET_STATE": {
      return action.payload.initialState;
    }

    default:
      return state;
  }
}
