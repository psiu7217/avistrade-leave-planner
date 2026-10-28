import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Clock,
  AlertTriangle,
  Pencil,
  History,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import {
  calculateLeaveDays,
  compareDateStr,
  formatDateRangeRu,
  formatDateRu,
  getDateRangeArray,
  isSummerDate,
  MONTH_NAMES_RU,
  WEEKDAYS_SHORT_RU,
} from "../domain/dates";
import {
  getEmployeeDateSummary,
  getMonthCalendarGrid,
  getMonthsForHorizon,
} from "../domain/calendarProjection";
import { getConfirmedLeaves } from "../domain/corporateRules";
import { isOfficialHoliday } from "../data/holidays";
import {
  validatePreference,
  validationFingerprint,
} from "../domain/validatePreference";
import {
  Preference,
  PreferenceStatus,
  ValidationResult,
} from "../domain/types";
import { useDialogFocus } from "../components/useDialogFocus";
import { getEmployeeBalances } from "../domain/leaveBalances";

const labels: Record<PreferenceStatus, string> = {
  draft: "Черновик",
  submitted: "На рассмотрении",
  returned: "Нужно исправить",
  approved: "Согласовано в плане",
  rejected: "Отклонено",
  withdrawn: "Отозвано",
};
function privateMessage(result: ValidationResult): string {
  if (result.code === "UNPAID_HR_BASIS")
    return "HR проверит основание и продолжительность. Для сессии может потребоваться справка-вызов и проверка права на оплату. Трудовой остаток не расходуется.";
  if (/^CORP-0[2-5]/.test(result.code))
    return "На эти даты действует ограничение совместного отсутствия по вашей должности. HR рассмотрит возможность исключения.";
  if (result.code === "CORP-08")
    return "Выбранный замещающий тоже отсутствует в этот период. Выберите другого коллегу или отправьте на рассмотрение HR.";
  return result.message;
}
export function EmployeePage() {
  const {
    state,
    currentUser,
    dispatch,
    horizon,
    setHorizon,
    calendarMonth,
    setCalendarMonth,
    calendarYear,
    showNotification,
  } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [replacementId, setReplacement] = useState("");
  const [comment, setComment] = useState("");
  const [leaveType, setLeaveType] = useState<"labor" | "unpaid">("labor");
  const [unpaidReason, setUnpaidReason] = useState<"personal" | "study">(
    "personal",
  );
  const [editingId, setEditingId] = useState<string | undefined>();
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [history, setHistory] = useState(false);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useDialogFocus(!!withdrawId, () => setWithdrawId(null));
  const months = getMonthsForHorizon(horizon);
  const weeks = getMonthCalendarGrid(
    calendarYear,
    calendarMonth,
    state.demoDate,
  );
  const candidate = {
    leaveType,
    unpaidReason,
    id: editingId,
    employeeId: currentUser.id,
    startDate,
    endDate,
    replacementEmployeeId: replacementId,
    comment,
    submittedOn: state.demoDate,
  };
  const validation = validatePreference(
    candidate,
    state,
    state.demoDate,
    editingId,
  );
  const fingerprint = validationFingerprint(validation, state);
  useEffect(
    () => setAcknowledged(false),
    [fingerprint, replacementId, startDate, endDate, leaveType, unpaidReason],
  );
  const selected = new Set(getDateRangeArray(startDate, endDate));
  const ownPrefs = state.preferences.filter(
    (p) => p.employeeId === currentUser.id,
  );
  const ownAbsences = state.existingAbsences.filter(
    (a) => a.employeeId === currentUser.id,
  );
  const confirmedDates = new Set(
    getConfirmedLeaves(state)
      .filter((a) => a.employeeId === currentUser.id && a.type === "labor")
      .flatMap((a) => getDateRangeArray(a.startDate, a.endDate))
      .filter((d) => d.startsWith(`${calendarYear}-`))
      .filter((d) => !isOfficialHoliday(d)),
  );
  const summerUsed = [...confirmedDates].filter(isSummerDate).length;
  const balances = getEmployeeBalances(state, currentUser.id, calendarYear);
  const balanceKnown = balances.length > 0 && balances.every((b) => b.complete);
  const remaining = balances.reduce((sum, b) => sum + (b.remaining ?? 0), 0);
  const items = [
    ...ownPrefs.map((p) => ({
      ...p,
      pref: p,
      type: p.leaveType ?? "labor",
      past:
        ["rejected", "withdrawn"].includes(p.status) ||
        (p.status === "approved" && p.endDate < state.demoDate),
    })),
    ...ownAbsences.map((a) => ({
      ...a,
      status: "approved" as PreferenceStatus,
      pref: null as Preference | null,
      comment: a.note ?? "",
      returnReason: undefined as string | undefined,
      rejectionReason: undefined as string | undefined,
      isException: false,
      past: a.phase === "used" || a.endDate < state.demoDate,
    })),
  ]
    .filter((i) => i.past === history)
    .sort((a, b) =>
      history
        ? compareDateStr(b.startDate, a.startDate)
        : compareDateStr(a.startDate, b.startDate),
    );
  const resetForm = () => {
    setStart("");
    setEnd("");
    setReplacement("");
    setComment("");
    setLeaveType("labor");
    setUnpaidReason("personal");
    setEditingId(undefined);
    setSelectingEnd(false);
    setAcknowledged(false);
    setError("");
  };
  const openNew = () => {
    resetForm();
    setFormOpen(true);
  };
  const edit = (p: Preference) => {
    setLeaveType(p.leaveType ?? "labor");
    setUnpaidReason(p.unpaidReason ?? "personal");
    setStart(p.startDate);
    setEnd(p.endDate);
    setReplacement(p.replacementEmployeeId);
    setComment(p.comment);
    setEditingId(p.id);
    setAcknowledged(false);
    setSelectingEnd(false);
    setError("");
    setFormOpen(true);
    const month = Number(p.startDate.slice(5, 7));
    if (!months.includes(month)) setHorizon("ALL");
    setCalendarMonth(month);
    document
      .getElementById("leave-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const selectDay = (date: string) => {
    setFormOpen(true);
    setError("");
    if (!selectingEnd) {
      setStart(date);
      setEnd(date);
      setSelectingEnd(true);
    } else {
      if (date < startDate) {
        setEnd(startDate);
        setStart(date);
      } else setEnd(date);
      setSelectingEnd(false);
    }
    setAcknowledged(false);
  };
  const save = (draft: boolean) => {
    try {
      const payload = {
        leaveType,
        unpaidReason,
        id: editingId,
        employeeId: currentUser.id,
        startDate,
        endDate,
        replacementEmployeeId: replacementId,
        comment,
        acknowledgedCodes: acknowledged
          ? validation.results.map((r) => r.code)
          : undefined,
        acknowledgedFingerprint: acknowledged ? fingerprint : undefined,
      };
      const actor = { actorId: currentUser.id, actorName: currentUser.name };
      if (draft) dispatch({ type: "SAVE_DRAFT", payload, ...actor });
      else dispatch({ type: "SUBMIT_PREFERENCE", payload, ...actor });
      showNotification(
        "success",
        draft
          ? "Черновик сохранён. Его можно продолжить в списке отпусков."
          : "Пожелание отправлено. Решение появится в вашем плане.",
      );
      resetForm();
      setFormOpen(false);
      setHistory(false);
    } catch (e) {
      setError((e as Error).message);
      setAcknowledged(false);
    }
  };
  const visibleResults = validation.results.filter(
    (r) =>
      r.code !== "INPUT_DATES_INVALID" &&
      (replacementId || !r.code.startsWith("INPUT_REPLACEMENT")),
  );
  return (
    <div className="employee-workspace">
      <section className="employee-heading">
        <div>
          <p className="eyebrow">Личный кабинет · 2027 год</p>
          <h1>Мои отпуска</h1>
          <p>
            {currentUser.name} · {currentUser.departmentName}
          </p>
        </div>
        <button className="primary-button" onClick={openNew}>
          <Plus size={18} /> Запланировать отпуск
        </button>
      </section>
      <section className="personal-summary" aria-label="Ваш план на год">
        <div>
          <span>Осталось запланировать</span>
          <strong>
            {balanceKnown ? remaining : "Уточнить у HR"}{" "}
            {balanceKnown && <small>дн.</small>}
          </strong>
        </div>
        <div>
          <span>Ждут решения</span>
          <strong>
            {ownPrefs.filter((p) => p.status === "submitted").length}{" "}
            <small>пожеланий</small>
          </strong>
        </div>
        <div>
          <span>Летом согласовано</span>
          <strong>
            {summerUsed}{" "}
            <small>из {state.corporateRules.summerMaxDays.value} дн.</small>
          </strong>
        </div>
        <p>
          Остаток по праву за рабочий год за вычетом использованных и
          согласованных дней. Ожидающие пожелания его не уменьшают. Это плановый
          остаток, а не начисленные дни для компенсации. Данные
          демонстрационные.
        </p>
      </section>
      <section
        className="balance-details"
        aria-label="Остатки трудового отпуска"
      >
        {balances.map((b) => (
          <details key={b.workYear.id}>
            <summary>
              Как посчитан остаток · Рабочий год:{" "}
              {formatDateRangeRu(b.workYear.startDate, b.workYear.endDate)}
            </summary>
            <p>
              Право: {b.workYear.entitlementDays} дн. · Использовано: {b.used} ·
              Уже в плане: {b.planned} · Ждут решения: {b.pending}
            </p>
            <p>
              {b.complete
                ? `Ещё не использовано: ${b.unused} дн.; свободно для планирования: ${b.remaining} дн.${b.overplanned ? ` Превышение плана: ${b.overplanned} дн.` : ""}`
                : "История неполна — остаток должен подтвердить HR."}
            </p>
          </details>
        ))}
        {!balances.length && (
          <p>Нет данных рабочего года. Остаток уточните у HR.</p>
        )}
      </section>
      <div className={formOpen ? "employee-grid with-form" : "employee-grid"}>
        <section className="calendar-panel" aria-label="Календарь отпусков">
          <div className="calendar-toolbar">
            <h2>
              <CalendarDays size={20} /> Календарь
            </h2>
            <label className="visually-hidden" htmlFor="employee-horizon">
              Период календаря
            </label>
            <select
              id="employee-horizon"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as any)}
            >
              <option value="H1">Январь — июнь</option>
              <option value="H2">Июль — декабрь</option>
              <option value="ALL">Весь год</option>
            </select>
          </div>
          <div className="month-navigation">
            <button
              aria-label="Предыдущий месяц"
              disabled={calendarMonth === months[0]}
              onClick={() => setCalendarMonth(calendarMonth - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <h3>
              {MONTH_NAMES_RU[calendarMonth - 1]} {calendarYear}
            </h3>
            <button
              aria-label="Следующий месяц"
              disabled={calendarMonth === months.at(-1)}
              onClick={() => setCalendarMonth(calendarMonth + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <p className="calendar-instruction">
            {selectingEnd
              ? "Теперь выберите последний день отпуска. Можно перейти в другой месяц."
              : "Нажмите первый и последний день, чтобы выбрать период."}
          </p>
          <div className="month-grid">
            <div className="weekdays">
              {WEEKDAYS_SHORT_RU.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {weeks.map((week, i) => (
              <div className="calendar-week" key={i}>
                {week.map((day) => {
                  const summary = getEmployeeDateSummary(
                    currentUser.id,
                    day.dateStr,
                    state,
                  );
                  const approved =
                    summary.myStatus === "approved" ||
                    summary.myStatus === "approved_exception";
                  const pending = summary.myStatus === "submitted";
                  const ownUnavailable = approved || pending;
                  const isSelected = formOpen && selected.has(day.dateStr);
                  const status = approved
                    ? "approved"
                    : pending
                      ? "pending"
                      : isSelected
                        ? "selected"
                        : summary.myStatus === "draft"
                          ? "draft"
                          : summary.myStatus === "returned"
                            ? "returned"
                            : summary.hasColleagueConfirmedAbsence
                              ? "conflict"
                              : summary.hasColleaguePending
                                ? "competition"
                                : "free";
                  const dayLabels: Record<string, string> = {
                    approved: "Мой отпуск",
                    pending: "Ждёт HR",
                    selected: "Выбираю",
                    draft: "Черновик",
                    returned: "Исправить",
                    conflict: "Ограничение",
                    competition: "Конкуренция",
                    free: "Свободно",
                  };
                  const disabled =
                    !day.isCurrentMonth ||
                    day.isPast ||
                    day.year !== 2027 ||
                    ownUnavailable;
                  return (
                    <button
                      type="button"
                      key={day.dateStr}
                      className={`day-cell day-${status} ${!day.isCurrentMonth ? "outside-month" : ""} ${day.isWeekend ? "weekend" : ""}`}
                      disabled={disabled}
                      onClick={() => selectDay(day.dateStr)}
                      aria-label={`${day.dateStr}, ${dayLabels[status]}${day.holidayName ? ", " + day.holidayName : ""}`}
                      aria-pressed={isSelected}
                      title={`${formatDateRu(day.dateStr, "full")}: ${dayLabels[status]}${day.holidayName ? " · " + day.holidayName : ""}`}
                    >
                      <span className="day-number">
                        {day.dayNumber}
                        {day.isHoliday && <span aria-label="Праздник"> *</span>}
                      </span>
                      {day.isCurrentMonth && (
                        <span className="day-status">
                          {approved ? (
                            <Check size={12} />
                          ) : pending ? (
                            <Clock size={12} />
                          ) : status === "conflict" ? (
                            <AlertTriangle size={12} />
                          ) : null}
                          {dayLabels[status]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="calendar-legend" aria-label="Цвета календаря">
            {[
              ["free", "Свободно"],
              ["conflict", "Ограничение — можно предложить"],
              ["approved", "Мой согласованный отпуск"],
              ["pending", "Моё пожелание ждёт HR"],
              ["selected", "Выбираю сейчас"],
              ["draft", "Черновик"],
              ["competition", "Другие пожелания"],
            ].map(([code, label]) => (
              <span key={code}>
                <i className={`legend-swatch day-${code}`} />
                {label}
              </span>
            ))}
          </div>
        </section>
        {formOpen && (
          <section
            id="leave-form"
            className="leave-form-panel"
            aria-labelledby="leave-form-title"
          >
            <div className="calendar-toolbar">
              <h2 id="leave-form-title">
                {editingId ? "Изменить пожелание" : "Новый отпуск"}
              </h2>
              <button
                aria-label="Закрыть форму"
                onClick={() => {
                  setFormOpen(false);
                  resetForm();
                }}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              Выберите даты и замещающего. HR рассмотрит ваше пожелание.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(false);
              }}
            >
              <label>
                Вид отпуска
                <select
                  value={leaveType}
                  onChange={(e) =>
                    setLeaveType(e.target.value as "labor" | "unpaid")
                  }
                >
                  <option value="labor">Трудовой (оплачиваемый)</option>
                  <option value="unpaid">Без сохранения зарплаты</option>
                </select>
              </label>
              {leaveType === "unpaid" && (
                <>
                  <label>
                    Причина запроса
                    <select
                      value={unpaidReason}
                      onChange={(e) =>
                        setUnpaidReason(e.target.value as "personal" | "study")
                      }
                    >
                      <option value="personal">
                        Личные / семейные обстоятельства
                      </option>
                      <option value="study">Учёба / сессия</option>
                    </select>
                  </label>
                  <p className="muted">
                    Трудовой остаток не расходуется. HR проверит основание и
                    срок. Для сессии HR также проверит учебные гарантии и
                    положена ли оплата.
                  </p>
                </>
              )}
              <div className="date-inputs">
                <label>
                  Первый день
                  <input
                    type="date"
                    min="2027-01-01"
                    max="2027-12-31"
                    value={startDate}
                    required
                    onChange={(e) => {
                      setStart(e.target.value);
                      setSelectingEnd(false);
                    }}
                  />
                </label>
                <label>
                  Последний день
                  <input
                    type="date"
                    min={startDate || "2027-01-01"}
                    max="2027-12-31"
                    value={endDate}
                    required
                    onChange={(e) => {
                      setEnd(e.target.value);
                      setSelectingEnd(false);
                    }}
                  />
                </label>
              </div>
              <label>
                Кто вас заменит
                <select
                  value={replacementId}
                  required
                  onChange={(e) => setReplacement(e.target.value)}
                >
                  <option value="">Выберите коллегу</option>
                  {state.employees
                    .filter((e) => e.active && e.id !== currentUser.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {leaveType === "unpaid"
                  ? "Основание запроса · обязательно"
                  : "Комментарий · необязательно"}
                <textarea
                  required={leaveType === "unpaid"}
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Что важно учесть при рассмотрении"
                />
              </label>
              {startDate && endDate && validation.absenceDays > 0 && (
                <div className="form-day-count">
                  <strong>
                    {leaveType === "unpaid"
                      ? `${validation.absenceDays} календ. дн. без сохранения зарплаты`
                      : `${validation.leaveDays} дн. отпуска`}
                  </strong>
                  <span>
                    {validation.absenceDays} календарных дней отсутствия
                    {validation.holidayDates.length > 0
                      ? ` · ${validation.holidayDates.length} праздничных дней не расходуют отпуск`
                      : ""}
                  </span>
                  {leaveType === "labor" && (
                    <span>
                      Летний расход с этим периодом: {validation.summerDays} из{" "}
                      {validation.summerLimit} дн.
                    </span>
                  )}
                  {!!validation.pendingSummerDays && (
                    <span>
                      Другие ожидающие пожелания летом:{" "}
                      {validation.pendingSummerDays} дн. — пока не согласованы.
                    </span>
                  )}
                </div>
              )}
              {startDate && endDate && visibleResults.length > 0 && (
                <div className="validation-list">
                  {visibleResults.map((r, i) => (
                    <p key={i} className={`finding finding-${r.kind}`}>
                      <AlertTriangle size={16} />
                      <span>{privateMessage(r)}</span>
                    </p>
                  ))}
                </div>
              )}
              {startDate && endDate && validation.requiresAcknowledgement && (
                <label className="acknowledgement">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span>
                    Я понимаю указанные конфликты. Эти даты требуют отдельного
                    рассмотрения HR или руководителем; отправка не означает
                    согласования отпуска.
                  </span>
                </label>
              )}
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  validation.hasInputErrors ||
                  (validation.requiresAcknowledgement && !acknowledged)
                }
              >
                Отправить пожелание
              </button>
              <button
                type="button"
                className="secondary-button full-width"
                disabled={!startDate && !endDate && !comment}
                onClick={() => save(true)}
              >
                Сохранить черновик
              </button>
            </form>
          </section>
        )}
      </div>
      <section className="my-leave-list">
        <div className="leave-list-toolbar">
          <div
            className="personal-tabs"
            role="group"
            aria-label="Список отпусков"
          >
            <button
              className={!history ? "active" : ""}
              onClick={() => setHistory(false)}
            >
              Мои отпуска
            </button>
            <button
              className={history ? "active" : ""}
              onClick={() => setHistory(true)}
            >
              <History size={16} /> История
            </button>
          </div>
          <span className="muted">Весь 2027 год · {items.length} записей</span>
        </div>
        {!items.length && (
          <p className="empty-state">
            {history
              ? "Здесь появятся завершённые, отклонённые и отозванные периоды."
              : "Пока нет отпусков. Выберите даты в календаре или нажмите «Запланировать отпуск»."}
          </p>
        )}
        <div className="leave-cards">
          {items.map((item) => {
            const calc = calculateLeaveDays(item.startDate, item.endDate);
            const status = item.pref
              ? labels[item.status]
              : item.type === "labor"
                ? item.past
                  ? "Использован"
                  : "Согласовано в плане"
                : "Плановое отсутствие";
            return (
              <article key={item.id} className="leave-card">
                <div className={`leave-status-line status-${item.status}`} />
                <div className="leave-card-body">
                  <div className="leave-card-title">
                    <h3>
                      {formatDateRangeRu(item.startDate, item.endDate) ||
                        "Даты ещё не выбраны"}
                    </h3>
                    <span className={`status-badge status-${item.status}`}>
                      {status}
                    </span>
                  </div>
                  <p>
                    {item.type === "labor"
                      ? `${calc.leaveDays} дн. отпуска`
                      : `${calc.absenceDays} календ. дн. · ${item.type === "unpaid" ? "Без сохранения зарплаты" : "Другое отсутствие"}`}
                    {calc.absenceDays !== calc.leaveDays &&
                    item.type === "labor"
                      ? ` · ${calc.absenceDays} календарных дней`
                      : ""}
                    {item.isException ? " · Согласовано с исключением" : ""}
                  </p>
                  {item.returnReason && (
                    <p className="response-message">
                      HR просит исправить: {item.returnReason}
                    </p>
                  )}
                  {item.rejectionReason && (
                    <p className="response-message">
                      Причина отказа: {item.rejectionReason}
                    </p>
                  )}
                  {item.comment && <p className="muted">{item.comment}</p>}
                  {item.pref && (
                    <details className="request-history">
                      <summary>История пожелания</summary>
                      <ol>
                        {state.auditEvents
                          .filter(
                            (e) =>
                              e.entityId === item.id &&
                              [
                                "SAVE_DRAFT",
                                "SUBMIT_PREFERENCE",
                                "APPROVE_PREFERENCE",
                                "APPROVE_EXCEPTION",
                                "RETURN_PREFERENCE",
                                "REJECT_PREFERENCE",
                                "WITHDRAW_PREFERENCE",
                              ].includes(e.action),
                          )
                          .slice()
                          .reverse()
                          .map((e) => (
                            <li key={e.id}>
                              <time>
                                {new Date(e.createdAt).toLocaleString("ru-RU", {
                                  timeZone: "Europe/Minsk",
                                })}
                              </time>{" "}
                              ·{" "}
                              {
                                (
                                  {
                                    SAVE_DRAFT: "Сохранён черновик",
                                    SUBMIT_PREFERENCE: "Отправлено HR",
                                    APPROVE_PREFERENCE: "Согласовано в плане",
                                    APPROVE_EXCEPTION:
                                      "Согласовано с исключением",
                                    RETURN_PREFERENCE:
                                      "Возвращено на корректировку",
                                    REJECT_PREFERENCE: "Отклонено",
                                    WITHDRAW_PREFERENCE: "Отозвано",
                                  } as Record<string, string>
                                )[e.action]
                              }
                            </li>
                          ))}
                        <li>
                          Запись создана:{" "}
                          {formatDateRu(item.pref.createdAt.slice(0, 10))}
                        </li>
                      </ol>
                    </details>
                  )}
                </div>
                <div className="leave-card-actions">
                  {item.pref && ["draft", "returned"].includes(item.status) && (
                    <button
                      className="secondary-button"
                      onClick={() => edit(item.pref!)}
                    >
                      <Pencil size={15} />{" "}
                      {item.status === "returned" ? "Исправить" : "Продолжить"}
                    </button>
                  )}
                  {item.pref && item.status === "submitted" && (
                    <button
                      className="text-button"
                      onClick={() => setWithdrawId(item.id)}
                    >
                      Отозвать
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {withdrawId && (
        <div className="dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-title"
            className="simple-dialog"
          >
            <h2 id="withdraw-title">Отозвать пожелание?</h2>
            <p>
              HR больше не будет рассматривать эти даты. Запись останется в
              истории.
            </p>
            <div className="dialog-actions">
              <button
                autoFocus
                className="secondary-button"
                onClick={() => setWithdrawId(null)}
              >
                Оставить
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  try {
                    dispatch({
                      type: "WITHDRAW_PREFERENCE",
                      payload: { preferenceId: withdrawId },
                      actorId: currentUser.id,
                      actorName: currentUser.name,
                    });
                    setWithdrawId(null);
                    showNotification(
                      "info",
                      "Пожелание отозвано и сохранено в истории.",
                    );
                  } catch (e) {
                    showNotification("error", (e as Error).message);
                  }
                }}
              >
                Отозвать пожелание
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
