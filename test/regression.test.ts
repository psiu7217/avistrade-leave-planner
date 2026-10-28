import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_DEMO_STATE as INITIAL_STATE, STORAGE_KEY } from "../src/data/seed";
import { AppState, Preference } from "../src/domain/types";
import { appReducer } from "../src/domain/workflow";
import {
  validatePreference,
  validationFingerprint,
  changedApprovalConflicts,
} from "../src/domain/validatePreference";
import {
  getEmployeeDateSummary,
  getHorizonDateRange,
  getMonthCalendarGrid,
} from "../src/domain/calendarProjection";
import { checkSummerMaxDays } from "../src/domain/corporateRules";
import { checkWorkYearParts } from "../src/domain/legalChecks";
import { addCalendarMonths } from "../src/domain/dates";
import {
  isAppState,
  loadSavedState,
  saveCurrentState,
} from "../src/services/persistence";

const fresh = (): AppState => structuredClone(INITIAL_STATE);
const employee = { actorId: "emp-mpp-3", actorName: "Иван Морозов" };
const hr = { actorId: "emp-hr", actorName: "Наталья Соколова" };
const payload = {
  employeeId: employee.actorId,
  startDate: "2027-08-23",
  endDate: "2027-08-29",
  replacementEmployeeId: "emp-mpp-4",
  comment: "",
};

test("снятие конфликта новым правилом не создаёт ложное предупреждение по замещающему", () => {
  let state = submit();
  state = appReducer(state, {
    type: "APPROVE_EXCEPTION",
    payload: {
      preferenceId: state.preferences[0].id,
      reason: "Основание для тестового исключения",
    },
    ...hr,
  });
  const baseline = state.existingAbsences.find(
    (a) => a.id === "abs-mpp-1-aug",
  )!;
  const p: Preference = {
    ...state.preferences[0],
    id: baseline.id,
    employeeId: baseline.employeeId,
    replacementEmployeeId: employee.actorId,
    approvedRuleVersions: {
      salesMaxConcurrent: 1,
      summerMaxDays: 1,
      noticeMonths: 1,
    },
  };
  state.corporateRules.salesMaxConcurrent = {
    ...state.corporateRules.salesMaxConcurrent,
    value: 3,
    version: 2,
  };
  assert.deepEqual(changedApprovalConflicts(p, state), []);
  state.corporateRules.salesMaxConcurrent.value = 1;
  assert.ok(
    changedApprovalConflicts(p, state).some((r) => r.code === "CORP-01"),
  );
});
test("собственное пересечение и несуществующая дата блокируют отправку", () => {
  const state = fresh();
  assert.ok(
    validatePreference(
      { ...payload, startDate: "2027-03-20", endDate: "2027-03-25" },
      state,
    ).results.some((r) => r.code === "INPUT_SELF_OVERLAP"),
  );
  assert.equal(
    validatePreference({ ...payload, startDate: "2027-02-30" }, state)
      .hasInputErrors,
    true,
  );
  assert.equal(
    validatePreference(
      { ...payload, startDate: "2027-10-10", endDate: "2027-10-01" },
      state,
    ).hasInputErrors,
    true,
  );
});
test("замещающий в подтверждённом отпуске даёт корпоративный конфликт", () => {
  assert.ok(
    validatePreference(
      { ...payload, replacementEmployeeId: "emp-mpp-1" },
      fresh(),
    ).results.some((r) => r.code === "CORP-08"),
  );
});
test("ровно месяц допустим, днем раньше требуется исключение; часовой пояс подачи — Минск", () => {
  const state = fresh();
  state.existingAbsences = [];
  state.preferences = [];
  assert.ok(
    !validatePreference(
      {
        ...payload,
        startDate: "2027-02-28",
        endDate: "2027-03-06",
        submittedOn: "2027-01-31",
      },
      state,
    ).results.some((r) => r.code === "CORP-07"),
  );
  assert.ok(
    validatePreference(
      {
        ...payload,
        startDate: "2027-02-27",
        endDate: "2027-03-05",
        submittedOn: "2027-01-31",
      },
      state,
    ).results.some((r) => r.code === "CORP-07"),
  );
  assert.ok(
    validatePreference(
      {
        ...payload,
        startDate: "2027-02-01",
        endDate: "2027-02-07",
        submittedAt: "2027-01-01T23:30:00Z",
      },
      state,
    ).results.some((r) => r.code === "CORP-07"),
  );
});
test("матрица совместимости симметрична и не связывает разные отделения", () => {
  const state = fresh();
  state.preferences = [];
  state.existingAbsences = [
    {
      id: "no",
      employeeId: "emp-no-1",
      startDate: "2027-10-04",
      endDate: "2027-10-17",
      type: "other",
      phase: "confirmed",
    },
  ];
  const a = validatePreference(
    {
      ...payload,
      employeeId: "emp-ro-1",
      startDate: "2027-10-04",
      endDate: "2027-10-17",
    },
    state,
  );
  assert.ok(a.results.some((r) => r.code === "CORP-03"));
  assert.ok(
    !validatePreference(
      {
        ...payload,
        employeeId: "emp-ro-2",
        startDate: "2027-10-04",
        endDate: "2027-10-17",
      },
      state,
    ).results.some((r) => r.code === "CORP-03"),
  );
  state.existingAbsences[0].employeeId = "emp-ro-1";
  assert.ok(
    validatePreference(
      {
        ...payload,
        employeeId: "emp-no-1",
        startDate: "2027-10-04",
        endDate: "2027-10-17",
      },
      state,
    ).results.some((r) => r.code === "CORP-03"),
  );
});
test("ожидающие пожелания не резервируют ёмкость, а согласование повторно проверяет текущие данные", () => {
  const state = fresh();
  state.existingAbsences = [];
  state.preferences = [];
  state.corporateRules.salesMaxConcurrent.value = 1;
  const a = submit(state, {
    ...payload,
    startDate: "2027-10-04",
    endDate: "2027-10-10",
  });
  const other = {
    ...payload,
    employeeId: "emp-mpp-1",
    startDate: "2027-10-04",
    endDate: "2027-10-10",
    replacementEmployeeId: "emp-hr",
  };
  const val = validatePreference(other, a);
  assert.equal(val.hasCorporateConflicts, false);
  assert.ok(val.results.some((r) => r.code === "COMPETITION_WARNING"));
  const b = appReducer(a, {
    type: "SUBMIT_PREFERENCE",
    payload: {
      ...other,
      acknowledgedCodes: val.results.map((r) => r.code),
      acknowledgedFingerprint: validationFingerprint(val, a),
    },
    actorId: "emp-mpp-1",
    actorName: "Алексей",
  });
  const idFirst = a.preferences[0].id,
    idSecond = b.preferences[0].id;
  const approved = appReducer(b, {
    type: "APPROVE_PREFERENCE",
    payload: { preferenceId: idFirst },
    ...hr,
  });
  assert.throws(() =>
    appReducer(approved, {
      type: "APPROVE_PREFERENCE",
      payload: { preferenceId: idSecond },
      ...hr,
    }),
  );
});
function submit(state = fresh(), body = payload) {
  const validation = validatePreference(body, state);
  return appReducer(state, {
    type: "SUBMIT_PREFERENCE",
    payload: {
      ...body,
      acknowledgedCodes: validation.results.map((r) => r.code),
      acknowledgedFingerprint: validationFingerprint(validation, state),
    },
    ...employee,
  });
}

test("конфликт: отдельное подтверждение, согласование исключения, один ID и запись журнала", () => {
  let state = submit();
  const request = state.preferences[0];
  assert.equal(request.status, "submitted");
  assert.equal(request.submittedOn, state.demoDate);
  state = appReducer(state, {
    type: "APPROVE_EXCEPTION",
    payload: {
      preferenceId: request.id,
      reason: "Дежурство на период отпуска обеспечено",
    },
    ...hr,
  });
  assert.equal(
    state.preferences.find((p) => p.id === request.id)?.status,
    "approved",
  );
  assert.equal(state.exceptions[0].preferenceId, request.id);
  assert.equal(state.preferences.filter((p) => p.id === request.id).length, 1);
  assert.ok(
    state.exceptions[0].violationsSnapshot.some((r) => r.code === "CORP-01"),
  );
  assert.equal(state.corporateRules.salesMaxConcurrent.value, 2);
  assert.equal(
    getEmployeeDateSummary(employee.actorId, payload.startDate, state).myStatus,
    "approved_exception",
  );
});
test("несогласованное исключение, пустое подтверждение и устаревшая версия не принимаются", () => {
  const state = fresh();
  assert.throws(
    () =>
      appReducer(state, { type: "SUBMIT_PREFERENCE", payload, ...employee }),
    /подтвердите/,
  );
  const val = validatePreference(payload, state);
  state.corporateRules.salesMaxConcurrent.version++;
  assert.throws(
    () =>
      appReducer(state, {
        type: "SUBMIT_PREFERENCE",
        payload: {
          ...payload,
          acknowledgedCodes: val.results.map((r) => r.code),
          acknowledgedFingerprint: validationFingerprint(val, fresh()),
        },
        ...employee,
      }),
    /изменились/,
  );
});
test("новые конфликтующие даты требуют нового подтверждения даже при прежнем коде", () => {
  const state = fresh();
  const val = validatePreference(payload, state);
  state.existingAbsences.find((a) => a.id === "abs-mpp-1-aug")!.endDate =
    "2027-08-25";
  assert.throws(() =>
    appReducer(state, {
      type: "SUBMIT_PREFERENCE",
      payload: {
        ...payload,
        acknowledgedCodes: val.results.map((r) => r.code),
        acknowledgedFingerprint: validationFingerprint(val, fresh()),
      },
      ...employee,
    }),
  );
});
test("одобрение обычного пожелания; повторное решение запрещено", () => {
  let state = submit(fresh(), {
    ...payload,
    startDate: "2027-10-04",
    endDate: "2027-10-10",
  });
  const id = state.preferences[0].id;
  state = appReducer(state, {
    type: "APPROVE_PREFERENCE",
    payload: { preferenceId: id },
    ...hr,
  });
  assert.throws(() =>
    appReducer(state, {
      type: "APPROVE_PREFERENCE",
      payload: { preferenceId: id },
      ...hr,
    }),
  );
  assert.equal(state.preferences[0].status, "approved");
});
test("согласованный период нельзя перезаписать черновиком или повторной подачей", () => {
  let state = submit();
  const id = state.preferences[0].id;
  state = appReducer(state, {
    type: "APPROVE_EXCEPTION",
    payload: { preferenceId: id, reason: "Основание для тестового исключения" },
    ...hr,
  });
  for (const type of ["SAVE_DRAFT", "SUBMIT_PREFERENCE"] as const)
    assert.throws(() =>
      appReducer(state, { type, payload: { ...payload, id }, ...employee }),
    );
});
test("сотрудник не согласует и не меняет правила", () => {
  const state = submit();
  assert.throws(
    () =>
      appReducer(state, {
        type: "APPROVE_EXCEPTION",
        payload: {
          preferenceId: state.preferences[0].id,
          reason: "Основание для тестового исключения",
        },
        ...employee,
      }),
    /только HR/,
  );
  assert.throws(
    () =>
      appReducer(state, {
        type: "UPDATE_RULE",
        payload: {
          code: "salesMaxConcurrent",
          newValue: 3,
          reason: "Тестовое изменение корпоративного правила",
        },
        ...employee,
      }),
    /только HR/,
  );
});
test("чужой черновик и чужой отзыв запрещены", () => {
  const state = submit();
  assert.throws(() =>
    appReducer(state, {
      type: "WITHDRAW_PREFERENCE",
      payload: { preferenceId: state.preferences[0].id },
      actorId: "emp-mpp-1",
      actorName: "A",
    }),
  );
  assert.throws(() =>
    appReducer(state, {
      type: "SAVE_DRAFT",
      payload,
      actorId: "emp-mpp-1",
      actorName: "A",
    }),
  );
});
test("возврат, черновик и повторная подача сохраняют ID, увеличивают ревизию и очищают согласие", () => {
  let state = submit();
  const id = state.preferences[0].id;
  state = appReducer(state, {
    type: "RETURN_PREFERENCE",
    payload: { preferenceId: id, reason: "Выберите другой период" },
    ...hr,
  });
  state = appReducer(state, {
    type: "SAVE_DRAFT",
    payload: { ...payload, id },
    ...employee,
  });
  assert.equal(state.preferences[0].status, "returned");
  assert.equal(state.preferences[0].acknowledgement, undefined);
  const val = validatePreference({ ...payload, id }, state, state.demoDate, id);
  state = appReducer(state, {
    type: "SUBMIT_PREFERENCE",
    payload: {
      ...payload,
      id,
      acknowledgedCodes: val.results.map((r) => r.code),
      acknowledgedFingerprint: validationFingerprint(val, state),
    },
    ...employee,
  });
  assert.equal(state.preferences[0].id, id);
  assert.equal(state.preferences[0].revision, 3);
});
test("юридический запрет невозможно обойти корпоративным исключением", () => {
  const state = fresh();
  const request = state.preferences.find(
    (p) => p.id === "pref-open-legal-block",
  )!;
  assert.equal(validatePreference(request, state).hasLegalBlocks, true);
  assert.throws(() =>
    appReducer(state, {
      type: "APPROVE_EXCEPTION",
      payload: {
        preferenceId: request.id,
        reason: "Очень важная причина исключения",
      },
      ...hr,
    }),
  );
});
test("исключение не обходит ошибку замещающего", () => {
  const state = submit();
  const request = state.preferences[0];
  request.replacementEmployeeId = "";
  assert.throws(() =>
    appReducer(state, {
      type: "APPROVE_EXCEPTION",
      payload: {
        preferenceId: request.id,
        reason: "Очень важная причина исключения",
      },
      ...hr,
    }),
  );
});
test("краткая часть с возможностью будущей длинной части не требует конфликтного checkbox", () => {
  const state = fresh();
  state.preferences = [];
  state.existingAbsences = [];
  const val = validatePreference(
    { ...payload, startDate: "2027-10-04", endDate: "2027-10-10" },
    state,
  );
  assert.ok(val.results.some((r) => r.code === "LEGAL-02-MIN-PART-WARNING"));
  assert.equal(val.requiresAcknowledgement, false);
  assert.equal(val.canApproveNormally, true);
});
test("неактивный сотрудник и отсутствующий замещающий не отправляются", () => {
  const state = fresh();
  state.employees.find((e) => e.id === employee.actorId)!.active = false;
  assert.equal(validatePreference(payload, state).hasInputErrors, true);
  assert.equal(
    validatePreference(
      { ...payload, replacementEmployeeId: undefined },
      fresh(),
    ).hasInputErrors,
    true,
  );
});
test("неполная конфигурация не приводит к падению или разрешению исключения", () => {
  const state = fresh();
  delete state.corporateRules.summerMaxDays;
  const val = validatePreference(payload, state);
  assert.ok(val.results.some((r) => r.kind === "config_review"));
  assert.equal(val.canApproveAsException, false);
});
test("не связанная с рабочим годом история и неподтверждённые три части требуют проверки", () => {
  const state = fresh();
  state.existingAbsences.find(
    (a) => a.employeeId === employee.actorId,
  )!.workYearId = undefined;
  assert.ok(
    checkWorkYearParts(
      state.employees.find((e) => e.id === employee.actorId)!,
      payload.startDate,
      payload.endDate,
      state,
    ).results.some((r) => r.code === "LEGAL-02-HISTORY-LINK"),
  );
  const state2 = fresh();
  const wy = state2.workYears.find((w) => w.employeeId === employee.actorId)!;
  wy.allowedParts = 3;
  wy.partsBasisRef = "";
  assert.ok(validatePreference(payload, state2).hasLegalReview);
});
test("параметры правил имеют целые границы, изменение сохраняет периоды и историю версии", () => {
  let state = fresh();
  for (const [code, value] of [
    ["salesMaxConcurrent", 0],
    ["salesMaxConcurrent", 99],
    ["summerMaxDays", 93],
    ["noticeMonths", 7],
    ["noticeMonths", 1.5],
    ["noticeMonths", NaN],
  ] as [string, number][]) {
    assert.throws(() =>
      appReducer(state, {
        type: "UPDATE_RULE",
        payload: {
          code,
          newValue: value,
          reason: "Основание для изменения правила",
        },
        ...hr,
      }),
    );
  }
  state = appReducer(state, {
    type: "UPDATE_RULE",
    payload: {
      code: "salesMaxConcurrent",
      newValue: 3,
      reason: "Расширен штат менеджеров продаж",
    },
    ...hr,
  });
  assert.equal(state.corporateRules.salesMaxConcurrent.version, 2);
  assert.equal(state.preferences.length, INITIAL_STATE.preferences.length);
});
test("дата подачи использует бизнес-дату, не дату запуска компьютера", () => {
  const state = fresh();
  state.demoDate = "2027-08-01";
  const val = validatePreference(
    {
      ...payload,
      submittedOn: state.demoDate,
      submittedAt: "2030-01-01T00:00:00Z",
    },
    state,
  );
  assert.ok(val.results.some((r) => r.code === "CORP-07"));
  assert.equal(addCalendarMonths("2027-01-31", 1), "2027-02-28");
});
test("летний итог учитывает согласованную часть, праздники и не смешивает разные годы", () => {
  const state = fresh();
  const result = checkSummerMaxDays(
    "emp-mpp-4",
    "2027-08-09",
    "2027-08-15",
    state,
    state.corporateRules.summerMaxDays,
  );
  assert.equal(result.totalSummerDays, 17);
  assert.equal(result.result?.actual, 17);
  state.existingAbsences.push({
    id: "old",
    employeeId: employee.actorId,
    startDate: "2026-06-01",
    endDate: "2026-06-14",
    type: "labor",
    phase: "used",
  });
  assert.equal(
    checkSummerMaxDays(
      employee.actorId,
      "2027-07-01",
      "2027-07-15",
      state,
      state.corporateRules.summerMaxDays,
    ).totalSummerDays,
    14,
  );
});
test("свободный день не окрашивается занятым из-за не связанного с ролью коллеги", () => {
  const summary = getEmployeeDateSummary(
    employee.actorId,
    "2027-07-05",
    fresh(),
  );
  assert.equal(summary.hasColleagueConfirmedAbsence, false);
  assert.equal(
    getEmployeeDateSummary(employee.actorId, "2027-08-23", fresh())
      .hasColleagueConfirmedAbsence,
    true,
  );
});
test("согласованный собственный отпуск имеет приоритет над пересекающимся черновиком", () => {
  const state = fresh();
  state.preferences.unshift({
    ...state.preferences[0],
    id: "draft-overlap",
    employeeId: employee.actorId,
    startDate: "2027-03-15",
    endDate: "2027-03-20",
    status: "draft",
  });
  assert.equal(
    getEmployeeDateSummary(employee.actorId, "2027-03-16", state).myStatus,
    "approved",
  );
});
test("фильтр полугодия и календарь не меняют интервал", () => {
  assert.deepEqual(getHorizonDateRange(2027, "H1"), {
    start: "2027-01-01",
    end: "2027-06-30",
  });
  const dates = getMonthCalendarGrid(2027, 8)
    .flat()
    .filter((c) => c.isCurrentMonth);
  assert.equal(dates.length, 31);
  assert.equal(dates[0].dateStr, "2027-08-01");
});
test("состояние сериализуется без потери решения, исключения и правила; повреждение выявляется", () => {
  let state = submit();
  state = appReducer(state, {
    type: "APPROVE_EXCEPTION",
    payload: {
      preferenceId: state.preferences[0].id,
      reason: "Дежурство на период отпуска обеспечено",
    },
    ...hr,
  });
  const copy = JSON.parse(JSON.stringify(state));
  assert.ok(isAppState(copy));
  assert.equal(copy.preferences[0].status, "approved");
  assert.deepEqual(copy.exceptions, state.exceptions);
  assert.deepEqual(copy.corporateRules, state.corporateRules);
  for (const broken of [
    null,
    {},
    { ...state, employees: [] },
    { ...state, preferences: [null] },
    { ...state, corporateRules: {} },
    { ...state, workYears: [null] },
  ])
    assert.equal(isAppState(broken), false);
});
test("повреждённое хранилище не перезаписывается при чтении, отказ записи возвращает false", () => {
  const saved = new Map([[STORAGE_KEY, '{"schemaVersion":"2.0.0"}']]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    },
  });
  assert.equal(loadSavedState().isCorrupted, true);
  assert.equal(saved.get(STORAGE_KEY), '{"schemaVersion":"2.0.0"}');
  const old = console.error;
  console.error = () => {};
  try {
    assert.equal(saveCurrentState(fresh()), false);
  } finally {
    console.error = old;
  }
});
