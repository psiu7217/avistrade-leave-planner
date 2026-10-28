import { AppState, AuditEvent, Preference } from "../domain/types";
import {
  validatePreference,
  validationFingerprint,
} from "../domain/validatePreference";

/** Deterministic, fictional presentation data. No clock, storage or random ID access. */
export function buildShowcaseState(base: AppState, version: string): AppState {
  const state: AppState = JSON.parse(JSON.stringify(base));
  state.demoDataVersion = version;
  const contracts: Record<string, string> = {
    "emp-mpp-3": "2027-01-25",
    "emp-mpp-1": "2027-01-20",
    "emp-sec-1": "2027-01-10",
    "emp-sec-2": "2027-01-15",
    "emp-no-1": "2027-09-30",
    "emp-ro-2": "2027-10-31",
    "emp-ztv": "2027-12-31",
  };
  state.employees.forEach((e) => {
    e.contractEndDate = contracts[e.id];
  });
  // A second legal obstacle is unnecessary in the dedicated summer-limit example.
  state.existingAbsences.find((a) => a.id === "abs-mpp-4-jun")!.endDate =
    "2027-06-20";
  state.existingAbsences.find((a) => a.id === "abs-mpp-4-jun")!.note =
    "Основная часть 14 дней; дополнительная неделя в августе превысит летний лимит";
  state.workYears.find((w) => w.employeeId === "emp-sec-2")!.historyComplete =
    false;
  const andrey = state.preferences.find((p) => p.id === "pref-open-1")!;
  andrey.comment =
    "Семейная поездка. Текущие задачи готов передать Ивану Морозову.";

  let eventNumber = 0;
  const event = (
    p: Preference,
    action: string,
    summary: string,
    employeeAction = false,
    comment?: string,
  ) => {
    const actor = state.employees.find(
      (e) => e.id === (employeeAction ? p.employeeId : "emp-hr"),
    )!;
    const createdAt = `2026-10-28T08:${String(Math.floor(eventNumber / 60)).padStart(2, "0")}:${String(eventNumber % 60).padStart(2, "0")}Z`;
    eventNumber++;
    const audit: AuditEvent = {
      id: `demo-audit-${String(eventNumber).padStart(2, "0")}`,
      actorId: actor.id,
      actorName: actor.name,
      action,
      entityId: p.id,
      summary,
      comment,
      createdAt,
    };
    state.auditEvents.unshift(audit);
    p.updatedAt = createdAt;
    return createdAt;
  };
  const add = (
    input: Pick<
      Preference,
      | "id"
      | "employeeId"
      | "startDate"
      | "endDate"
      | "replacementEmployeeId"
      | "status"
      | "comment"
    > &
      Partial<Preference>,
  ) => {
    const p: Preference = {
      revision: 1,
      createdAt: "2026-10-28T08:00:00Z",
      updatedAt: "2026-10-28T08:00:00Z",
      leaveType: "labor",
      ...input,
    };
    state.preferences.push(p);
    if (p.status === "draft") {
      event(
        p,
        "SAVE_DRAFT",
        `Сохранён черновик: ${p.startDate} — ${p.endDate}`,
        true,
      );
      return;
    }
    p.submittedOn = state.demoDate;
    p.submittedAt = event(
      p,
      "SUBMIT_PREFERENCE",
      `Подано пожелание: ${p.startDate} — ${p.endDate}`,
      true,
    );
    const validation = validatePreference(p, state, state.demoDate, p.id);
    if (validation.requiresAcknowledgement)
      p.acknowledgement = {
        confirmedBy: p.employeeId,
        preferenceRevision: p.revision,
        confirmedAt: p.submittedAt,
        confirmedCodes: validation.results.map((r) => r.code),
        rulesFingerprint: validationFingerprint(validation, state),
      };
    if (p.status === "submitted") return;
    const reason = p.returnReason ?? p.rejectionReason ?? p.unpaidApprovalBasis;
    if (p.status === "approved") {
      p.approvedRuleVersions = Object.fromEntries(
        Object.values(state.corporateRules).map((r) => [r.code, r.version]),
      );
      if (p.isException) {
        p.exceptionId = `demo-exception-${p.id}`;
        const createdAt = event(
          p,
          "APPROVE_EXCEPTION",
          "Согласовано корпоративное исключение: обеспечено покрытие",
          false,
          "Подтверждено покрытие задач; согласован дополнительный день сверх летнего лимита.",
        );
        state.exceptions.push({
          id: p.exceptionId,
          preferenceId: p.id,
          preferenceRevision: p.revision,
          violationsSnapshot: validation.results.filter(
            (r) => r.kind === "corporate_conflict",
          ),
          ruleVersions: p.approvedRuleVersions,
          reason:
            "Подтверждено покрытие задач; согласован дополнительный день сверх летнего лимита.",
          approvedBy: "emp-hr",
          createdAt,
        });
      } else
        event(
          p,
          "APPROVE_PREFERENCE",
          "Согласовано в предварительном плане",
          false,
          reason,
        );
    } else if (p.status === "returned")
      event(
        p,
        "RETURN_PREFERENCE",
        `Возвращено на корректировку: ${reason}`,
        false,
        reason,
      );
    else if (p.status === "rejected")
      event(
        p,
        "REJECT_PREFERENCE",
        `Пожелание отклонено: ${reason}`,
        false,
        reason,
      );
    else if (p.status === "withdrawn")
      event(
        p,
        "WITHDRAW_PREFERENCE",
        "Сотрудник отозвал пожелание: изменились личные планы",
        true,
      );
  };

  // Both confirmed assignments are visible in the default August calendar.
  add({
    id: "demo-unpaid-approved-no",
    employeeId: "emp-no-1",
    startDate: "2027-08-16",
    endDate: "2027-08-18",
    replacementEmployeeId: "emp-hr",
    leaveType: "unpaid",
    unpaidReason: "personal",
    status: "approved",
    comment: "Семейные обстоятельства, три дня без сохранения зарплаты.",
    unpaidApprovalBasis:
      "Проверены заявление сотрудника и основание по ст. 190 ТК; согласованы три календарных дня.",
  });
  add({
    id: "demo-unpaid-approved-ztv",
    employeeId: "emp-ztv",
    startDate: "2027-08-17",
    endDate: "2027-08-19",
    replacementEmployeeId: "emp-hr",
    leaveType: "unpaid",
    unpaidReason: "personal",
    status: "approved",
    comment: "Личные обстоятельства. Передать организационные вопросы Наталье.",
    unpaidApprovalBasis:
      "Проверено личное заявление; согласованы три дня без сохранения зарплаты по ст. 190 ТК.",
  });
  add({
    id: "demo-unavailable-backup",
    employeeId: "emp-sec-1",
    startDate: "2027-08-23",
    endDate: "2027-08-29",
    replacementEmployeeId: "emp-mpp-1",
    status: "submitted",
    comment:
      "Пожелание с конфликтом: Алексей в эти даты тоже в отпуске. Готова обсудить другого замещающего.",
  });
  add({
    id: "demo-approved-exception",
    employeeId: "emp-mpp-1",
    startDate: "2027-08-15",
    endDate: "2027-08-22",
    replacementEmployeeId: "emp-ro-1",
    status: "approved",
    isException: true,
    comment:
      "Продление летнего отдыха на один день сверх лимита согласовано отдельно.",
  });
  add({
    id: "demo-complete-plan",
    employeeId: "emp-ro-2",
    startDate: "2027-01-08",
    endDate: "2027-01-31",
    replacementEmployeeId: "emp-ro-1",
    status: "approved",
    comment:
      "Полные 24 дня одним непрерывным периодом. Плановый остаток — ноль.",
  });
  add({
    id: "demo-ivan-study",
    employeeId: "emp-mpp-3",
    startDate: "2027-10-04",
    endDate: "2027-10-08",
    replacementEmployeeId: "emp-mpp-4",
    leaveType: "unpaid",
    unpaidReason: "study",
    status: "submitted",
    comment:
      "Экзаменационная сессия. Справка-вызов будет передана HR для проверки гарантий и оплаты.",
  });
  add({
    id: "demo-study-approved",
    employeeId: "emp-split-test",
    startDate: "2027-10-18",
    endDate: "2027-10-22",
    replacementEmployeeId: "emp-ro-2",
    leaveType: "unpaid",
    unpaidReason: "study",
    status: "approved",
    comment: "Сессия; условия предоставления проверены HR.",
    unpaidApprovalBasis:
      "Демонстрация: проверены справка-вызов и условия учебных гарантий, подтверждено основание без сохранения зарплаты.",
  });
  add({
    id: "demo-ivan-returned",
    employeeId: "emp-mpp-3",
    startDate: "2027-11-01",
    endDate: "2027-11-07",
    replacementEmployeeId: "emp-mpp-4",
    status: "returned",
    comment: "Осенний отдых.",
    returnReason:
      "Уточните передачу текущих клиентов замещающему и отправьте пожелание повторно.",
  });
  add({
    id: "demo-ivan-draft",
    employeeId: "emp-mpp-3",
    startDate: "2027-12-20",
    endDate: "2027-12-24",
    replacementEmployeeId: "",
    status: "draft",
    comment: "Пока выбираю даты перед праздниками.",
  });
  add({
    id: "demo-ivan-withdrawn",
    employeeId: "emp-mpp-3",
    startDate: "2027-07-01",
    endDate: "2027-07-07",
    replacementEmployeeId: "emp-mpp-4",
    status: "withdrawn",
    comment: "Поездка перенесена, пожелание отозвано.",
  });
  add({
    id: "demo-ivan-rejected",
    employeeId: "emp-mpp-3",
    startDate: "2027-08-02",
    endDate: "2027-08-08",
    replacementEmployeeId: "emp-mpp-4",
    status: "rejected",
    comment: "Первоначальный вариант семейной поездки.",
    rejectionReason:
      "После обсуждения выбран другой период; предложите новые даты отдельным пожеланием.",
  });

  // Normalize old examples too: submissions refer to the fixed business date and current checks.
  state.preferences
    .filter((p) => !p.id.startsWith("demo-"))
    .forEach((p) => {
      p.submittedOn = p.submittedAt?.slice(0, 10) ?? state.demoDate;
      const v = validatePreference(p, state, state.demoDate, p.id);
      if (v.requiresAcknowledgement)
        p.acknowledgement = {
          confirmedBy: p.employeeId,
          preferenceRevision: p.revision,
          confirmedAt: p.submittedAt ?? "2026-10-28T07:30:00Z",
          confirmedCodes: v.results.map((r) => r.code),
          rulesFingerprint: validationFingerprint(v, state),
        };
    });
  return state;
}
