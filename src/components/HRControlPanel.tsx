import React, { useMemo, useState } from "react";
import { UserCheck, AlertTriangle, Copy, X, ClipboardList } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useDialogFocus } from "./useDialogFocus";
import { formatDateRangeRu } from "../domain/dates";
import {
  buildPlanningReminder,
  COVERAGE_LABELS,
  getCoverageRisks,
  getPlanningRoster,
  PLANNING_LABELS,
  planningPeriodLabel,
  PlanningRow,
} from "../domain/hrInsights";
import { getHorizonDateRange } from "../domain/calendarProjection";

export function HRControlPanel({
  onOpenPreference,
}: {
  onOpenPreference: (id: string) => void;
}) {
  const { state, horizon, calendarYear, showNotification } = useApp();
  const [section, setSection] = useState<"collection" | "coverage">(
    "collection",
  );
  const [department, setDepartment] = useState("all");
  const [filter, setFilter] = useState<
    "all" | "response" | "pending" | "planned"
  >("response");
  const [message, setMessage] = useState<string | null>(null);
  useDialogFocus(message !== null, () => setMessage(null));
  const roster = useMemo(
    () => getPlanningRoster(state, calendarYear, horizon),
    [state, calendarYear, horizon],
  );
  const risks = useMemo(
    () => getCoverageRisks(state, calendarYear, horizon),
    [state, calendarYear, horizon],
  );
  const scoped = roster.filter(
    (r) => department === "all" || r.employee.departmentId === department,
  );
  const rows = scoped.filter((r) =>
    filter === "response"
      ? r.needsEmployeeResponse
      : filter === "pending"
        ? r.submittedCount > 0
        : filter === "planned"
          ? r.statuses.includes("planned")
          : true,
  );
  const visibleRisks = risks.filter(
    (r) =>
      department === "all" ||
      [
        r.replacementEmployeeId,
        ...r.confirmedEmployeeIds,
        ...r.pendingEmployeeIds,
      ].some(
        (id) =>
          state.employees.find((e) => e.id === id)?.departmentId === department,
      ),
  );
  const needResponse = scoped.filter((r) => r.needsEmployeeResponse);
  const missing = scoped.filter((r) => r.statuses.includes("missing")).length;
  const returned = scoped.filter((r) => r.returnedCount > 0).length;
  const pending = scoped.reduce((sum, r) => sum + r.submittedCount, 0);
  const received = scoped.length - missing;
  const range = getHorizonDateRange(calendarYear, horizon);
  const unknownBackupCount = state.existingAbsences.filter(
    (a) => a.startDate <= range.end && a.endDate >= range.start,
  ).length;
  const name = (id: string) =>
    state.employees.find((e) => e.id === id)?.name ?? "Неизвестный сотрудник";
  const prepare = (items: PlanningRow[]) =>
    setMessage(buildPlanningReminder(items, calendarYear, horizon));
  return (
    <section className="hr-control-panel" aria-labelledby="hr-control-title">
      <div className="control-intro">
        <div>
          <p className="eyebrow">
            {planningPeriodLabel(calendarYear, horizon)}
          </p>
          <h2 id="hr-control-title">Контроль плана</h2>
          <p>
            Кого ещё нужно включить в план и где замещение требует внимания.
          </p>
        </div>
        <label>
          Подразделение контроля
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="all">Вся компания</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="control-metrics">
        <button
          onClick={() => {
            setSection("collection");
            setFilter("all");
          }}
        >
          <span>Есть полученные даты</span>
          <strong>
            {received}
            <small> из {scoped.length} в списке</small>
          </strong>
        </button>
        <button
          onClick={() => {
            setSection("collection");
            setFilter("response");
          }}
        >
          <span>Ждём ответа сотрудника</span>
          <strong>
            {needResponse.length}
            <small> {missing} без дат · {returned} на корректировке</small>
          </strong>
        </button>
        <button
          onClick={() => {
            setSection("collection");
            setFilter("pending");
          }}
        >
          <span>Пожеланий у HR</span>
          <strong>
            {pending}
            <small> на рассмотрении</small>
          </strong>
        </button>
        <button onClick={() => setSection("coverage")}>
          <span>Сигналов по замещению</span>
          <strong>
            {visibleRisks.length}
            <small> в выбранном периоде</small>
          </strong>
        </button>
      </div>
      <div
        className="control-section-tabs"
        role="group"
        aria-label="Раздел контроля"
      >
        <button
          className={section === "collection" ? "active" : ""}
          onClick={() => setSection("collection")}
        >
          <ClipboardList size={18} /> Сбор пожеланий
        </button>
        <button
          className={section === "coverage" ? "active" : ""}
          onClick={() => setSection("coverage")}
        >
          <UserCheck size={18} /> Замещающие <span>{visibleRisks.length}</span>
        </button>
      </div>
      {section === "collection" ? (
        <div className="control-section">
          <div className="control-section-heading">
            <div>
              <h3>Список сотрудников, а не только заявок</h3>
              <p>
                «Нет дат» означает, что HR не получил актуального пожелания за
                выбранный период. Черновики сотрудника здесь не раскрываются.
                Наличие одной части ещё не означает завершённый годовой план.
              </p>
            </div>
            <button
              className="secondary-button"
              disabled={!needResponse.length}
              onClick={() => prepare(needResponse)}
            >
              <Copy size={16} /> Подготовить список для напоминания
            </button>
          </div>
          <div
            className="control-filters"
            role="group"
            aria-label="Статус сбора"
          >
            {(
              [
                ["response", "Нужен ответ сотрудника"],
                ["pending", "Ждут HR"],
                ["planned", "Есть согласованные даты"],
                ["all", "Все сотрудники"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {!rows.length ? (
            <p className="empty-state">
              В выбранном списке никого нет. Проверьте другой фильтр.
            </p>
          ) : (
            <div className="control-table-scroll">
              <table className="control-table">
                <thead>
                  <tr>
                    <th>Сотрудник и руководитель</th>
                    <th>Что происходит</th>
                    <th>Согласовано в периоде</th>
                    <th>Следующее действие</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employee.id}>
                      <td>
                        <strong>{row.employee.name}</strong>
                        <span>{row.employee.departmentName}</span>
                        <span>
                          Руководитель: {row.manager?.name ?? "Не указан"}
                        </span>
                      </td>
                      <td>
                        <div className="planning-badges">
                          {row.statuses.map((status) => (
                            <span
                              className={`planning-badge planning-${status}`}
                              key={status}
                            >
                              {PLANNING_LABELS[status]}
                              {status === "pending"
                                ? ` · ${row.submittedCount}`
                                : status === "returned"
                                  ? ` · ${row.returnedCount}`
                                  : ""}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <strong>{row.approvedDays} дн.</strong>
                        <span>Предварительный план</span>
                      </td>
                      <td>
                        <div className="control-actions">
                          {row.needsEmployeeResponse && (
                            <button
                              className="secondary-button"
                              onClick={() => prepare([row])}
                            >
                              Текст напоминания
                            </button>
                          )}
                          {row.requestIds.length > 0 && (
                            <details>
                              <summary>
                                Открыть пожелания ({row.requestIds.length})
                              </summary>
                              <div>
                                {row.requestIds.map((id) => {
                                  const p = state.preferences.find(
                                    (p) => p.id === id,
                                  )!;
                                  return (
                                    <button
                                      className="text-button"
                                      key={id}
                                      onClick={() => onOpenPreference(id)}
                                    >
                                      {formatDateRangeRu(
                                        p.startDate,
                                        p.endDate,
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                          {!row.needsEmployeeResponse &&
                            !row.requestIds.length && (
                              <span className="muted">Даты получены</span>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="control-note">
            Напоминание готовится как текст. Приложение не отправляет сообщения
            и не помечает людей как уведомлённых. Пожелания в очереди HR не
            считаются задержкой сотрудника.
          </p>
        </div>
      ) : (
        <div className="control-section">
          <div className="control-section-heading">
            <div>
              <h3>Один замещающий — несколько отсутствующих</h3>
              <p>
                Два назначения на один день — повод проверить объём работ и
                договорённость с коллегой, а не автоматический запрет отпуска.
                Ожидающие пожелания показаны отдельно от согласованных.
              </p>
            </div>
          </div>
          <p className="control-note">
            Расчёт выполняется по всей компании, даже при фильтре подразделения.
            В исходных записях отсутствий ({unknownBackupCount}) нет данных о
            замещающем — их нагрузку установить нельзя. Трудоёмкость и согласие
            коллег автоматически не определяются.
          </p>
          {!visibleRisks.length ? (
            <div className="coverage-empty">
              <UserCheck size={28} />
              <h4>По известным назначениям пересечений не найдено</h4>
              <p>
                Это не подтверждение полной укомплектованности: проверьте
                отсутствующие данные и фактический объём задач.
              </p>
            </div>
          ) : (
            <div className="coverage-risk-list">
              {visibleRisks.map((risk) => (
                <article
                  className={`coverage-risk risk-${risk.kind}`}
                  key={risk.id}
                >
                  <div className="coverage-risk-heading">
                    <div>
                      <span className="coverage-risk-kind">
                        <AlertTriangle size={16} />
                        {COVERAGE_LABELS[risk.kind]}
                      </span>
                      <h4>{name(risk.replacementEmployeeId)}</h4>
                      <p>{formatDateRangeRu(risk.startDate, risk.endDate)}</p>
                    </div>
                    <span className="coverage-count">
                      {
                        new Set([
                          ...risk.confirmedEmployeeIds,
                          ...risk.pendingEmployeeIds,
                        ]).size
                      }
                      <small>сотрудников</small>
                    </span>
                  </div>
                  <div className="coverage-breakdown">
                    <p>
                      <strong>Уже согласованы:</strong>{" "}
                      {risk.confirmedEmployeeIds.length
                        ? risk.confirmedEmployeeIds.map(name).join(", ")
                        : "нет"}
                    </p>
                    <p>
                      <strong>Ещё на рассмотрении:</strong>{" "}
                      {risk.pendingEmployeeIds.length
                        ? risk.pendingEmployeeIds.map(name).join(", ")
                        : "нет"}
                    </p>
                  </div>
                  <p className="coverage-next-step">
                    {risk.kind === "unavailable"
                      ? "Проверьте другого замещающего: этот коллега сам отсутствует."
                      : "До решения уточните, сможет ли коллега принять обе зоны ответственности, или верните пожелание с просьбой выбрать другого замещающего."}
                  </p>
                  <div className="control-actions">
                    {risk.requestIds.map((id) => {
                      const p = state.preferences.find((p) => p.id === id)!;
                      return (
                        <button
                          className="secondary-button"
                          key={id}
                          onClick={() => onOpenPreference(id)}
                        >
                          Открыть: {name(p.employeeId)}
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {message !== null && (
        <div className="dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-title"
            className="reminder-dialog"
          >
            <div className="calendar-toolbar">
              <h3 id="reminder-title">Текст для запроса дат</h3>
              <button
                aria-label="Закрыть текст напоминания"
                onClick={() => setMessage(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              Проверьте текст и отправьте привычным способом. Автоматической
              отправки нет.
            </p>
            <label className="visually-hidden" htmlFor="planning-reminder-text">
              Текст напоминания
            </label>
            <textarea
              id="planning-reminder-text"
              value={message}
              readOnly
              rows={11}
            />
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setMessage(null)}
              >
                Закрыть
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message);
                    showNotification(
                      "success",
                      "Текст скопирован. Сообщение не отправлено.",
                    );
                  } catch {
                    showNotification(
                      "info",
                      "Копирование недоступно. Выделите текст в поле и скопируйте вручную.",
                    );
                  }
                }}
              >
                <Copy size={16} /> Скопировать текст
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
