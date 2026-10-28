import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_STATE,
  BASE_DEMO_STATE,
  DEMO_DATA_VERSION,
  STORAGE_KEY,
} from "../src/data/seed";
import { buildShowcaseState } from "../src/data/showcase";
import {
  getCoverageRisks,
  getPlanningRoster,
  buildPlanningReminder,
} from "../src/domain/hrInsights";
import {
  getDeadlineRows,
  getEmployeeBalances,
} from "../src/domain/leaveBalances";
import {
  validatePreference,
  validationFingerprint,
} from "../src/domain/validatePreference";
import { appReducer } from "../src/domain/workflow";
import {
  isAppState,
  loadSavedState,
  resetStoredState,
} from "../src/services/persistence";
const fresh = () => structuredClone(INITIAL_STATE);
const hr = { actorId: "emp-hr", actorName: "Наталья Соколова" };
const ivan = { actorId: "emp-mpp-3", actorName: "Иван Морозов" };

test("полный демо-набор детерминирован, проходит проверку хранилища и не меняет базовую фикстуру", () => {
  const before = JSON.stringify(BASE_DEMO_STATE);
  assert.deepEqual(
    buildShowcaseState(BASE_DEMO_STATE, DEMO_DATA_VERSION),
    INITIAL_STATE,
  );
  assert.equal(JSON.stringify(BASE_DEMO_STATE), before);
  assert.ok(isAppState(JSON.parse(JSON.stringify(INITIAL_STATE))));
  for (const list of [
    INITIAL_STATE.preferences,
    INITIAL_STATE.auditEvents,
    INITIAL_STATE.exceptions,
  ])
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
});
test("по умолчанию HR видит четыре приоритетных контракта, нулевой и неизвестный остатки тоже представлены", () => {
  const s = fresh();
  assert.deepEqual(
    getDeadlineRows(s, 2027, 90)
      .filter((r) => r.urgent)
      .map((r) => r.employee.id)
      .sort(),
    ["emp-mpp-1", "emp-mpp-3", "emp-sec-1", "emp-sec-2"],
  );
  assert.equal(getEmployeeBalances(s, "emp-ro-2", 2027)[0].remaining, 0);
  assert.equal(getEmployeeBalances(s, "emp-sec-2", 2027)[0].remaining, null);
  assert.equal(
    getDeadlineRows(s, 2027).find((r) => r.employee.id === "emp-mpp-3")!
      .scheduledAfterContract,
    14,
  );
});
test("во II полугодии доступны все три вида рисков замещения, в августе их не скрывает фильтр периода", () => {
  const risks = getCoverageRisks(fresh(), 2027, "H2");
  assert.deepEqual(
    risks.map((r) => [r.kind, r.startDate, r.endDate]),
    [
      ["potential", "2027-08-09", "2027-08-15"],
      ["overload", "2027-08-17", "2027-08-18"],
      ["unavailable", "2027-08-23", "2027-08-29"],
    ],
  );
});
test("личный кабинет Ивана содержит все статусы для показа и сохраняет десять свободных дней", () => {
  const s = fresh(),
    own = s.preferences.filter((p) => p.employeeId === ivan.actorId);
  for (const status of [
    "draft",
    "returned",
    "submitted",
    "withdrawn",
    "rejected",
  ])
    assert.ok(own.some((p) => p.status === status));
  assert.ok(
    s.existingAbsences.some(
      (a) => a.employeeId === ivan.actorId && a.type === "labor",
    ),
  );
  assert.equal(getEmployeeBalances(s, ivan.actorId, 2027)[0].remaining, 10);
  assert.ok(
    own.some(
      (p) =>
        p.leaveType === "unpaid" &&
        p.unpaidReason === "study" &&
        p.status === "submitted",
    ),
  );
});
test("контроль сбора показывает все статусы, не раскрывает черновик и не напоминает ожидающему HR", () => {
  const rows = getPlanningRoster(fresh(), 2027, "H2");
  for (const status of ["missing", "returned", "pending", "planned"])
    assert.ok(rows.some((r) => r.statuses.includes(status as any)));
  assert.ok(
    !rows.some(
      (r) =>
        r.requestIds.includes("demo-ivan-draft") ||
        r.requestIds.includes("demo-ivan-study"),
    ),
  );
  const text = buildPlanningReminder(rows, 2027, "H2");
  assert.match(text, /Иван Морозов/);
  assert.ok(!text.includes("Андрей Белов"));
});
test("сценарий обычного согласования Андрея действительно выполняется командой", () => {
  const s = appReducer(fresh(), {
    type: "APPROVE_PREFERENCE",
    payload: { preferenceId: "pref-open-1" },
    ...hr,
  });
  assert.equal(
    s.preferences.find((p) => p.id === "pref-open-1")!.status,
    "approved",
  );
});
test("летний пример Ольги можно согласовать как исключение, его не блокирует посторонняя ошибка дробления", () => {
  let s = fresh();
  const p = s.preferences.find((p) => p.id === "pref-open-summer-demo")!;
  const v = validatePreference(p, s, s.demoDate, p.id);
  assert.equal(v.canApproveAsException, true);
  assert.ok(v.results.some((r) => r.code === "CORP-06"));
  s = appReducer(s, {
    type: "APPROVE_EXCEPTION",
    payload: {
      preferenceId: p.id,
      reason:
        "Покрытие продаж на дополнительную неделю согласовано руководителем",
    },
    ...hr,
  });
  assert.equal(s.preferences.find((q) => q.id === p.id)!.isException, true);
});
test("правовой запрет 12+12 и отдельная проверка сотрудника сохраняются в полном наборе", () => {
  const s = fresh();
  for (const id of ["pref-open-legal-block", "pref-open-legal-review"]) {
    const p = s.preferences.find((p) => p.id === id)!,
      v = validatePreference(p, s, s.demoDate, p.id);
    assert.equal(v.canApproveNormally, false);
    assert.equal(v.canApproveAsException, false);
    assert.throws(() =>
      appReducer(s, {
        type: "APPROVE_PREFERENCE",
        payload: { preferenceId: id },
        ...hr,
      }),
    );
  }
});
test("все подготовленные согласования допустимы, исключение имеет снимок, неоплачиваемые решения — основания", () => {
  const s = fresh();
  for (const p of s.preferences.filter((p) => p.status === "approved")) {
    const v = validatePreference(p, s, s.demoDate, p.id);
    assert.ok(
      p.isException ? v.canApproveAsException : v.canApproveNormally,
      p.id,
    );
    assert.ok(
      s.auditEvents.some(
        (a) =>
          a.entityId === p.id &&
          a.action ===
            (p.isException ? "APPROVE_EXCEPTION" : "APPROVE_PREFERENCE"),
      ),
    );
    if (p.leaveType === "unpaid")
      assert.ok((p.unpaidApprovalBasis?.length ?? 0) >= 10);
    if (p.isException)
      assert.ok(
        s.exceptions.some(
          (e) =>
            e.id === p.exceptionId &&
            e.violationsSnapshot.some((r) => r.code === "CORP-06"),
        ),
      );
  }
});
test("подготовленный учебный запрос Ивана согласовывается с основанием и не расходует трудовой остаток", () => {
  const s = appReducer(fresh(), {
    type: "APPROVE_PREFERENCE",
    payload: {
      preferenceId: "demo-ivan-study",
      unpaidApprovalBasis:
        "Проверены справка-вызов и основания отпуска без сохранения зарплаты",
    },
    ...hr,
  });
  assert.equal(
    s.preferences.find((p) => p.id === "demo-ivan-study")!.status,
    "approved",
  );
  assert.equal(getEmployeeBalances(s, ivan.actorId, 2027)[0].remaining, 10);
});
test("возвращённый пример можно исправить и повторно подать с тем же ID", () => {
  let s = fresh();
  const p = s.preferences.find((p) => p.id === "demo-ivan-returned")!;
  const candidate = { ...p, comment: "Передача клиентов согласована с Ольгой" };
  const v = validatePreference(candidate, s, s.demoDate, p.id);
  s = appReducer(s, {
    type: "SUBMIT_PREFERENCE",
    payload: {
      ...candidate,
      acknowledgedCodes: v.results.map((r) => r.code),
      acknowledgedFingerprint: validationFingerprint(v, s),
    },
    ...ivan,
  });
  assert.equal(s.preferences.find((q) => q.id === p.id)!.status, "submitted");
  assert.equal(s.preferences.find((q) => q.id === p.id)!.revision, 2);
});
test("старое сохранение не перезаписывается при загрузке, подтверждённый сброс даёт полный новый набор", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data: Record<string, string> = {
    [STORAGE_KEY]: JSON.stringify(BASE_DEMO_STATE),
    unrelated: "keep",
  };
  const before = data[STORAGE_KEY];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    },
  });
  try {
    const old = loadSavedState();
    assert.equal(old.isCorrupted, false);
    assert.equal(old.state.demoDataVersion, undefined);
    assert.equal(data[STORAGE_KEY], before);
    const next = resetStoredState();
    assert.equal(next.demoDataVersion, DEMO_DATA_VERSION);
    assert.equal(getCoverageRisks(next, 2027, "H2").length, 3);
    assert.equal(data.unrelated, "keep");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as any).localStorage;
  }
});
