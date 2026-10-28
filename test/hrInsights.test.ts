import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_STATE } from "../src/data/seed";
import { AppState, Preference } from "../src/domain/types";
import {
  buildPlanningReminder,
  getCoverageRisks,
  getPlanningRoster,
} from "../src/domain/hrInsights";
import { validatePreference } from "../src/domain/validatePreference";
import { appReducer } from "../src/domain/workflow";

const fresh = (): AppState => structuredClone(INITIAL_STATE);
const request = (
  id: string,
  employeeId: string,
  overrides: Partial<Preference> = {},
): Preference => ({
  id,
  employeeId,
  startDate: "2027-08-09",
  endDate: "2027-08-15",
  replacementEmployeeId: "emp-mpp-3",
  comment: "",
  status: "submitted",
  revision: 1,
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
  submittedOn: "2026-10-28",
  ...overrides,
});
function empty() {
  const s = fresh();
  s.preferences = [];
  s.existingAbsences = [];
  return s;
}

test("контроль начинается с полного списка активных сотрудников, а не заявок", () => {
  const state = empty();
  const rows = getPlanningRoster(state, 2027, "H2");
  assert.equal(rows.length, state.employees.filter((e) => e.active).length);
  assert.ok(
    rows.every(
      (r) => r.statuses.includes("missing") && r.needsEmployeeResponse,
    ),
  );
});
test("черновики не раскрываются HR и не изображают полученные даты", () => {
  const state = empty();
  state.preferences = [
    request("draft", "emp-mpp-1", {
      status: "draft",
      comment: "PRIVATE DRAFT CONTENT",
    }),
  ];
  const rows = getPlanningRoster(state, 2027, "H2");
  const row = rows.find((r) => r.employee.id === "emp-mpp-1")!;
  assert.deepEqual(row.statuses, ["missing"]);
  assert.deepEqual(row.requestIds, []);
  assert.ok(!JSON.stringify(rows).includes("PRIVATE DRAFT CONTENT"));
});
test("ожидающее решение — работа HR, напоминание не адресуется этому сотруднику", () => {
  const state = empty();
  state.preferences = [request("pending", "emp-mpp-1")];
  const row = getPlanningRoster(state, 2027, "H2").find(
    (r) => r.employee.id === "emp-mpp-1",
  )!;
  assert.equal(row.needsEmployeeResponse, false);
  assert.equal(row.submittedCount, 1);
  assert.deepEqual(row.statuses, ["pending"]);
  assert.ok(
    !buildPlanningReminder([row], 2027, "H2").includes(row.employee.name),
  );
});
test("корректировка учитывается даже при наличии другого согласованного периода", () => {
  const state = empty();
  state.preferences = [
    request("approved", "emp-mpp-1", { status: "approved" }),
    request("returned", "emp-mpp-1", {
      status: "returned",
      startDate: "2027-10-04",
      endDate: "2027-10-10",
    }),
  ];
  const row = getPlanningRoster(state, 2027, "ALL").find(
    (r) => r.employee.id === "emp-mpp-1",
  )!;
  assert.equal(row.needsEmployeeResponse, true);
  assert.ok(row.statuses.includes("planned"));
  assert.ok(row.statuses.includes("returned"));
  assert.ok(
    buildPlanningReminder([row], 2027, "ALL").includes("нужна корректировка"),
  );
});
test("фильтр горизонта клипирует дни и не считает другую половину года полученным планом", () => {
  const state = empty();
  state.preferences = [
    request("cross", "emp-mpp-1", {
      status: "approved",
      startDate: "2027-06-29",
      endDate: "2027-07-04",
    }),
  ];
  const h1 = getPlanningRoster(state, 2027, "H1").find(
    (r) => r.employee.id === "emp-mpp-1",
  )!;
  const h2 = getPlanningRoster(state, 2027, "H2").find(
    (r) => r.employee.id === "emp-mpp-1",
  )!;
  assert.equal(h1.approvedDays, 2);
  assert.equal(h2.approvedDays, 3);
  state.preferences[0].endDate = "2027-06-30";
  assert.deepEqual(
    getPlanningRoster(state, 2027, "H2").find(
      (r) => r.employee.id === "emp-mpp-1",
    )!.statuses,
    ["missing"],
  );
});
test("подтверждённый трудовой период учитывается, неоплачиваемый не заменяет план отпуска", () => {
  const state = empty();
  state.existingAbsences = [
    {
      id: "a",
      employeeId: "emp-mpp-1",
      startDate: "2027-08-09",
      endDate: "2027-08-15",
      type: "labor",
      phase: "confirmed",
    },
    {
      id: "b",
      employeeId: "emp-mpp-2",
      startDate: "2027-08-09",
      endDate: "2027-08-15",
      type: "unpaid",
      phase: "confirmed",
    },
  ];
  const rows = getPlanningRoster(state, 2027, "H2");
  assert.ok(
    rows
      .find((r) => r.employee.id === "emp-mpp-1")!
      .statuses.includes("planned"),
  );
  assert.ok(
    rows
      .find((r) => r.employee.id === "emp-mpp-2")!
      .statuses.includes("missing"),
  );
});
test("отозванные и отклонённые периоды не подменяют актуальный план; неактивные исключены", () => {
  const state = empty();
  state.preferences = [
    request("x", "emp-mpp-1", { status: "withdrawn" }),
    request("y", "emp-mpp-2", { status: "rejected" }),
  ];
  state.employees.find((e) => e.id === "emp-hr")!.active = false;
  const rows = getPlanningRoster(state, 2027, "H2");
  assert.ok(!rows.some((r) => r.employee.id === "emp-hr"));
  assert.ok(
    rows
      .find((r) => r.employee.id === "emp-mpp-1")!
      .statuses.includes("missing"),
  );
  assert.ok(
    rows
      .find((r) => r.employee.id === "emp-mpp-2")!
      .statuses.includes("missing"),
  );
});
test("сумма дней убирает дубли и исключает праздник, не объявляя частичный план полным", () => {
  const state = empty();
  state.preferences = [
    request("x", "emp-mpp-1", {
      status: "approved",
      startDate: "2027-07-01",
      endDate: "2027-07-05",
    }),
    request("y", "emp-mpp-1", {
      status: "approved",
      startDate: "2027-07-04",
      endDate: "2027-07-05",
    }),
  ];
  const row = getPlanningRoster(state, 2027, "ALL").find(
    (r) => r.employee.id === "emp-mpp-1",
  )!;
  assert.equal(row.approvedDays, 4);
  assert.deepEqual(row.statuses, ["planned"]);
});
test("два ожидающих назначения — потенциальное замещение, не согласованная нагрузка", () => {
  const state = empty();
  state.preferences = [
    request("a", "emp-no-2", { startDate: "2027-08-02" }),
    request("b", "emp-mpp-4"),
  ];
  const risks = getCoverageRisks(state, 2027, "H2");
  assert.equal(risks.length, 1);
  assert.equal(risks[0].kind, "potential");
  assert.equal(risks[0].startDate, "2027-08-09");
  assert.equal(risks[0].endDate, "2027-08-15");
  assert.equal(risks[0].confirmedEmployeeIds.length, 0);
  assert.equal(risks[0].pendingEmployeeIds.length, 2);
});
test("один согласованный и один ожидающий не изображаются двумя согласованными", () => {
  const state = empty();
  state.preferences = [
    request("a", "emp-no-2", { status: "approved" }),
    request("b", "emp-mpp-4"),
  ];
  const risk = getCoverageRisks(state, 2027, "H2")[0];
  assert.equal(risk.kind, "potential");
  assert.equal(risk.confirmedEmployeeIds.length, 1);
  assert.equal(risk.pendingEmployeeIds.length, 1);
});
test("два согласованных назначения обнаруживаются и после перезагрузки", () => {
  const state = empty();
  state.preferences = [
    request("a", "emp-no-2", { status: "approved" }),
    request("b", "emp-mpp-4", { status: "approved" }),
  ];
  const risks = getCoverageRisks(JSON.parse(JSON.stringify(state)), 2027, "H2");
  assert.equal(risks[0].kind, "overload");
  assert.equal(risks[0].confirmedEmployeeIds.length, 2);
  assert.equal(risks[0].pendingEmployeeIds.length, 0);
});
test("нагрузка считается по уникальным отсутствующим, не по числу записей", () => {
  const state = empty();
  state.preferences = [
    request("a", "emp-no-2", { status: "approved" }),
    request("duplicate", "emp-no-2", { status: "approved" }),
  ];
  assert.deepEqual(getCoverageRisks(state, 2027, "H2"), []);
});
test("соседние периоды не создают двойного замещения; общий последний день создаёт", () => {
  const state = empty();
  state.preferences = [
    request("a", "emp-no-2", {
      startDate: "2027-08-01",
      endDate: "2027-08-05",
    }),
    request("b", "emp-mpp-4", {
      startDate: "2027-08-06",
      endDate: "2027-08-10",
    }),
  ];
  assert.deepEqual(getCoverageRisks(state, 2027, "H2"), []);
  state.preferences[1].startDate = "2027-08-05";
  const risks = getCoverageRisks(state, 2027, "H2");
  assert.equal(risks[0].startDate, "2027-08-05");
  assert.equal(risks[0].endDate, "2027-08-05");
});
test("диапазоны рисков клипируются горизонтом, состав назначений не теряется", () => {
  const state = empty();
  state.preferences = [
    request("a", "emp-no-2", {
      startDate: "2027-06-29",
      endDate: "2027-07-04",
    }),
    request("b", "emp-mpp-4", {
      startDate: "2027-06-29",
      endDate: "2027-07-04",
    }),
  ];
  const h1 = getCoverageRisks(state, 2027, "H1")[0],
    h2 = getCoverageRisks(state, 2027, "H2")[0];
  assert.equal(h1.endDate, "2027-06-30");
  assert.equal(h2.startDate, "2027-07-01");
  assert.deepEqual(h1.requestIds, ["a", "b"]);
});
test("возврат и отзыв снимают потенциальную нагрузку без ручного удаления предупреждения", () => {
  const state = empty();
  state.preferences = [request("a", "emp-no-2"), request("b", "emp-mpp-4")];
  assert.equal(getCoverageRisks(state, 2027, "H2").length, 1);
  state.preferences[1].status = "returned";
  assert.equal(getCoverageRisks(state, 2027, "H2").length, 0);
  state.preferences[1].status = "withdrawn";
  assert.equal(getCoverageRisks(state, 2027, "H2").length, 0);
});
test("собственное отсутствие замещающего обнаруживается даже при одном назначении", () => {
  const state = empty();
  state.preferences = [request("a", "emp-no-2")];
  state.existingAbsences = [
    {
      id: "backup-absent",
      employeeId: "emp-mpp-3",
      startDate: "2027-08-10",
      endDate: "2027-08-12",
      type: "other",
      phase: "confirmed",
    },
  ];
  const risk = getCoverageRisks(state, 2027, "H2")[0];
  assert.equal(risk.kind, "unavailable");
  assert.equal(risk.startDate, "2027-08-10");
  assert.equal(risk.endDate, "2027-08-12");
});
test("неизвестные замещающие в исходных отсутствиях не выдумываются", () => {
  const state = empty();
  state.existingAbsences = [
    {
      id: "a",
      employeeId: "emp-no-2",
      startDate: "2027-08-09",
      endDate: "2027-08-15",
      type: "labor",
      phase: "confirmed",
    },
    {
      id: "b",
      employeeId: "emp-mpp-4",
      startDate: "2027-08-09",
      endDate: "2027-08-15",
      type: "labor",
      phase: "confirmed",
    },
  ];
  assert.deepEqual(getCoverageRisks(state, 2027, "H2"), []);
});
test("сигнал замещения не становится новым запретом и не меняет правила согласования", () => {
  const state = fresh();
  const p = state.preferences.find((p) => p.id === "pref-open-1")!;
  assert.ok(
    getCoverageRisks(state, 2027, "H2").some((r) =>
      r.requestIds.includes(p.id),
    ),
  );
  assert.equal(
    validatePreference(p, state, state.demoDate, p.id).canApproveNormally,
    true,
  );
  const next = appReducer(state, {
    type: "APPROVE_PREFERENCE",
    payload: { preferenceId: p.id },
    actorId: "emp-hr",
    actorName: "HR",
  });
  const risk = getCoverageRisks(next, 2027, "H2").find((r) =>
    r.requestIds.includes(p.id),
  )!;
  assert.equal(risk.kind, "potential");
  assert.equal(risk.confirmedEmployeeIds.length, 1);
});
