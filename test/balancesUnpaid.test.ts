import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_STATE } from "../src/data/seed";
import { AppState, Preference } from "../src/domain/types";
import {
  getEmployeeBalances,
  getDeadlineRows,
} from "../src/domain/leaveBalances";
import { appReducer } from "../src/domain/workflow";
import {
  validatePreference,
  validationFingerprint,
} from "../src/domain/validatePreference";
import {
  getConfirmedLeaves,
  checkSummerMaxDays,
} from "../src/domain/corporateRules";
import { getPlanningRoster } from "../src/domain/hrInsights";
import { isAppState } from "../src/services/persistence";
const emp = { actorId: "emp-mpp-3", actorName: "Иван Морозов" };
const hr = { actorId: "emp-hr", actorName: "Наталья Соколова" };
const fresh = (): AppState => structuredClone(INITIAL_STATE);
const balance = (s: AppState) => getEmployeeBalances(s, emp.actorId, 2027)[0];
const request = (overrides: Partial<Preference> = {}): Preference => ({
  id: "new",
  employeeId: emp.actorId,
  startDate: "2027-05-03",
  endDate: "2027-05-05",
  replacementEmployeeId: "emp-mpp-4",
  comment: "Семейные обстоятельства",
  status: "submitted",
  revision: 1,
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
  submittedOn: "2026-10-28",
  ...overrides,
});
const unpaid = (overrides: Partial<Preference> = {}) =>
  request({ leaveType: "unpaid", unpaidReason: "personal", ...overrides });

test("длительное личное отсутствие требует правовой проверки, а не корпоративного исключения", () => {
  const v = validatePreference(
    unpaid({ startDate: "2027-06-01", endDate: "2027-07-05" }),
    fresh(),
  );
  assert.ok(v.results.some((r) => r.code === "UNPAID_DURATION_REVIEW"));
  assert.equal(v.canApproveNormally, false);
  assert.equal(v.canApproveAsException, false);
});

test("при подсчёте личного неоплачиваемого срока учитываются предыдущие согласованные периоды", () => {
  const s = fresh();
  s.preferences.push(
    unpaid({
      id: "prior",
      status: "approved",
      startDate: "2027-06-01",
      endDate: "2027-06-25",
    }),
  );
  assert.ok(
    validatePreference(
      unpaid({ startDate: "2027-08-01", endDate: "2027-08-07" }),
      s,
    ).results.some((r) => r.code === "UNPAID_DURATION_REVIEW"),
  );
});

test("перекрывающиеся рабочие годы не дают ложного удвоенного остатка", () => {
  const s = fresh();
  s.workYears.push({ ...balance(s).workYear, id: "overlap" });
  assert.ok(
    getEmployeeBalances(s, emp.actorId, 2027).every(
      (b) => b.remaining === null,
    ),
  );
});

test("порог внимания 30 и 90 дней меняет только приоритет, не остаток", () => {
  const s = fresh();
  assert.equal(
    getDeadlineRows(s, 2027, 30).find((r) => r.employee.id === emp.actorId)!
      .urgent,
    false,
  );
  assert.equal(
    getDeadlineRows(s, 2027, 90).find((r) => r.employee.id === emp.actorId)!
      .urgent,
    true,
  );
  assert.equal(balance(s).remaining, 10);
});

test("корпоративное исключение для неоплачиваемого отпуска тоже требует отдельного основания", () => {
  let s = submit(
    fresh(),
    unpaid({ startDate: "2027-08-23", endDate: "2027-08-29" }),
  );
  const id = s.preferences[0].id;
  const action = {
    type: "APPROVE_EXCEPTION" as const,
    payload: { preferenceId: id, reason: "Руководитель подтвердил покрытие" },
    ...hr,
  };
  assert.throws(() => appReducer(s, action), /основание неоплачиваемого/);
  s = appReducer(s, {
    ...action,
    payload: {
      ...action.payload,
      unpaidApprovalBasis: "Проверено заявление и основание ст.190",
    },
  });
  assert.equal(s.preferences[0].leaveType, "unpaid");
  assert.match(s.preferences[0].unpaidApprovalBasis!, /ст.190/);
  assert.equal(balance(s).remaining, 10);
});

test("неоплачиваемые 14 дней не заменяют обязательную длинную часть трудового отпуска", () => {
  const s = fresh();
  s.existingAbsences = [];
  s.preferences = [
    request({
      id: "labor12",
      startDate: "2027-05-15",
      endDate: "2027-05-26",
      status: "approved",
    }),
    unpaid({
      id: "unpaid14",
      startDate: "2027-06-01",
      endDate: "2027-06-14",
      status: "approved",
    }),
  ];
  const v = validatePreference(
    request({ startDate: "2027-10-01", endDate: "2027-10-12" }),
    s,
  );
  assert.equal(v.hasFourteenDayPart, false);
  assert.equal(v.hasLegalBlocks, true);
});
function submit(s: AppState, p = unpaid()) {
  const v = validatePreference(p, s);
  return appReducer(s, {
    type: "SUBMIT_PREFERENCE",
    payload: {
      ...p,
      id: undefined,
      acknowledgedCodes: v.results.map((r) => r.code),
      acknowledgedFingerprint: validationFingerprint(v, s),
    },
    ...emp,
  });
}
test("остаток отделяет неиспользованное право от уже согласованного плана", () => {
  const b = balance(fresh());
  assert.equal(b.unused, 24);
  assert.equal(b.planned, 14);
  assert.equal(b.remaining, 10);
  assert.equal(b.used, 0);
});
test("ожидающее пожелание видно отдельно и не списывает доступные дни", () => {
  const s = fresh();
  s.preferences.push(request());
  assert.equal(balance(s).pending, 3);
  assert.equal(balance(s).remaining, 10);
});
test("трудовой отпуск после решения HR уменьшает плановый остаток", () => {
  const s = fresh();
  s.preferences.push(request({ status: "approved" }));
  assert.equal(balance(s).remaining, 7);
});
test("все виды неоплачиваемых записей не расходуют трудовой остаток", () => {
  const s = fresh();
  s.preferences.push(
    unpaid({ status: "approved" }),
    unpaid({ id: "pending", startDate: "2027-06-01", endDate: "2027-06-15" }),
  );
  s.existingAbsences.push({
    id: "unpaid",
    employeeId: emp.actorId,
    startDate: "2027-07-01",
    endDate: "2027-07-04",
    phase: "used",
    type: "unpaid",
  });
  assert.equal(balance(s).remaining, 10);
  assert.equal(balance(s).pending, 0);
});
test("дубли в истории и плане не уменьшают остаток дважды", () => {
  const s = fresh();
  s.preferences.push(
    request({
      startDate: "2027-03-15",
      endDate: "2027-03-28",
      status: "approved",
    }),
  );
  assert.equal(balance(s).remaining, 10);
});
test("использованные дни отделены от будущих и праздник не расходует трудовой отпуск", () => {
  const s = fresh();
  s.existingAbsences = [
    {
      id: "used",
      employeeId: emp.actorId,
      startDate: "2027-01-01",
      endDate: "2027-01-03",
      phase: "used",
      type: "labor",
      workYearId: balance(s).workYear.id,
    },
  ];
  assert.equal(balance(s).used, 1);
  assert.equal(balance(s).planned, 0);
  assert.equal(balance(s).unused, 23);
});
test("непривязанная история даёт неизвестный остаток вместо выдуманного числа", () => {
  const s = fresh();
  s.existingAbsences.find((a) => a.employeeId === emp.actorId)!.workYearId =
    undefined;
  assert.equal(balance(s).remaining, null);
  assert.equal(balance(s).unused, null);
});
test("разные рабочие годы не смешиваются", () => {
  const s = fresh();
  s.workYears.push({
    ...balance(s).workYear,
    id: "previous",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    entitlementDays: 100,
  });
  assert.equal(getEmployeeBalances(s, emp.actorId, 2027).length, 1);
  assert.equal(balance(s).remaining, 10);
});
test("превышение плана видно отдельно, остаток не отрицательный", () => {
  const s = fresh();
  s.preferences.push(
    request({
      startDate: "2027-10-01",
      endDate: "2027-10-31",
      status: "approved",
    }),
  );
  assert.equal(balance(s).remaining, 0);
  assert.equal(balance(s).overplanned, 21);
});
test("отпуск после окончания контракта сохраняет срочный сигнал", () => {
  const row = getDeadlineRows(fresh(), 2027, 90).find(
    (r) => r.employee.id === emp.actorId,
  )!;
  assert.equal(row.urgent, true);
  assert.equal(row.scheduledAfterContract, 14);
  assert.equal(row.contractDays, 89);
});
test("полностью покрытый планом отпуск до окончания контракта не требует нового планирования", () => {
  const s = fresh();
  s.workYears.find((w) => w.employeeId === emp.actorId)!.entitlementDays = 14;
  const a = s.existingAbsences.find((a) => a.employeeId === emp.actorId)!;
  a.startDate = "2027-01-08";
  a.endDate = "2027-01-21";
  assert.equal(
    getDeadlineRows(s, 2027, 90).find((r) => r.employee.id === emp.actorId)!
      .urgent,
    false,
  );
});
test("неизвестный контракт не выдумывает срочность; неполный остаток при близком контракте требует проверки", () => {
  const s = fresh(),
    e = s.employees.find((e) => e.id === emp.actorId)!;
  e.contractEndDate = undefined;
  assert.equal(
    getDeadlineRows(s, 2027, 90).find((r) => r.employee.id === e.id)!.urgent,
    false,
  );
  e.contractEndDate = "2027-01-25";
  s.workYears.find((w) => w.employeeId === e.id)!.historyComplete = false;
  assert.equal(
    getDeadlineRows(s, 2027, 90).find((r) => r.employee.id === e.id)!.urgent,
    true,
  );
});
test("срок контракта изменяет только HR, проверяется дата и пишется аудит", () => {
  const s = fresh(),
    action = {
      type: "UPDATE_CONTRACT" as const,
      payload: { employeeId: emp.actorId, contractEndDate: "2027-02-28" },
      ...hr,
    };
  assert.throws(() => appReducer(s, { ...action, ...emp }), /HR/);
  assert.throws(() =>
    appReducer(s, {
      ...action,
      payload: { ...action.payload, contractEndDate: "2027-02-30" },
    }),
  );
  const updated = appReducer(s, action);
  assert.equal(
    updated.employees.find((e) => e.id === emp.actorId)!.contractEndDate,
    "2027-02-28",
  );
  assert.equal(updated.auditEvents[0].action, "UPDATE_CONTRACT");
  assert.ok(isAppState(JSON.parse(JSON.stringify(updated))));
});
test("неоплачиваемый отпуск не требует 14-дневной части и считает праздники календарно", () => {
  const v = validatePreference(
    unpaid({ startDate: "2027-01-01", endDate: "2027-01-03" }),
    fresh(),
  );
  assert.equal(v.absenceDays, 3);
  assert.equal(v.leaveDays, 0);
  assert.equal(v.summerDays, 0);
  assert.ok(
    !v.results.some(
      (r) => r.code.startsWith("LEGAL-01") || r.code.startsWith("LEGAL-02"),
    ),
  );
  assert.equal(v.canApproveNormally, true);
});
test("неоплачиваемому запросу нужна причина, пересечение собственных отпусков запрещено", () => {
  assert.equal(
    validatePreference(unpaid({ comment: " " }), fresh()).hasInputErrors,
    true,
  );
  assert.ok(
    validatePreference(
      unpaid({ startDate: "2027-03-20", endDate: "2027-03-22" }),
      fresh(),
    ).results.some((r) => r.code === "INPUT_SELF_OVERLAP"),
  );
});
test("сессия не объявляется автоматически неоплачиваемой: есть предупреждение о гарантиях", () => {
  assert.match(
    validatePreference(unpaid({ unpaidReason: "study" }), fresh()).results.find(
      (r) => r.code === "UNPAID_HR_BASIS",
    )!.message,
    /положена ли оплата/,
  );
});
test("подача и согласование требуют основания, сохраняют вид после перезагрузки и не списывают дни", () => {
  let s = submit(fresh());
  const p = s.preferences[0];
  assert.equal(p.leaveType, "unpaid");
  assert.throws(
    () =>
      appReducer(s, {
        type: "APPROVE_PREFERENCE",
        payload: { preferenceId: p.id },
        ...hr,
      }),
    /основание/,
  );
  s = appReducer(s, {
    type: "APPROVE_PREFERENCE",
    payload: {
      preferenceId: p.id,
      unpaidApprovalBasis: "Проверены заявление и основание по ст.190 ТК",
    },
    ...hr,
  });
  assert.equal(balance(s).remaining, 10);
  assert.equal(
    getConfirmedLeaves(s).find((a) => a.id === p.id)!.type,
    "unpaid",
  );
  assert.ok(isAppState(JSON.parse(JSON.stringify(s))));
  assert.match(s.preferences[0].unpaidApprovalBasis!, /ст.190/);
  assert.match(s.auditEvents[0].comment!, /ст.190/);
});
test("согласованный неоплачиваемый отпуск не попадает в летний трудовой лимит", () => {
  const s = fresh();
  s.preferences.push(
    unpaid({
      status: "approved",
      startDate: "2027-06-01",
      endDate: "2027-06-30",
    }),
  );
  assert.equal(
    checkSummerMaxDays(
      emp.actorId,
      "2027-08-01",
      "2027-08-07",
      s,
      s.corporateRules.summerMaxDays,
    ).totalSummerDays,
    7,
  );
  assert.ok(getConfirmedLeaves(s).some((a) => a.type === "unpaid"));
});
test("неоплачиваемый запрос не выдаётся за собранный план трудового отпуска", () => {
  const s = fresh();
  s.existingAbsences = [];
  s.preferences = [unpaid()];
  assert.deepEqual(
    getPlanningRoster(s, 2027, "ALL").find(
      (r) => r.employee.id === emp.actorId,
    )!.statuses,
    ["missing"],
  );
});
test("возврат и черновик сохраняют неоплачиваемый вид и остаток", () => {
  let s = submit(fresh());
  const p = s.preferences[0];
  s = appReducer(s, {
    type: "RETURN_PREFERENCE",
    payload: { preferenceId: p.id, reason: "Уточните документы на отсутствие" },
    ...hr,
  });
  s = appReducer(s, {
    type: "SAVE_DRAFT",
    payload: { ...p, comment: "Документы уточнены" },
    ...emp,
  });
  assert.equal(s.preferences[0].leaveType, "unpaid");
  assert.equal(s.preferences[0].status, "returned");
  assert.equal(balance(s).remaining, 10);
});
