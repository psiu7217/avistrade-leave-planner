import React, { useState } from "react";
import { useApp } from "../store/AppContext";
import { daysUntil, getDeadlineRows } from "../domain/leaveBalances";
import { formatDateRangeRu, formatDateRu } from "../domain/dates";
import { Employee } from "../domain/types";
import { useDialogFocus } from "./useDialogFocus";

export function HRBalancesPanel() {
  const { state, currentUser, dispatch, calendarYear, showNotification } =
    useApp();
  const [threshold, setThreshold] = useState(90);
  const [filter, setFilter] = useState("urgent");
  const [department, setDepartment] = useState("all");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [date, setDate] = useState("");
  useDialogFocus(!!editing, () => setEditing(null));
  const all = getDeadlineRows(state, calendarYear, threshold).filter(
    (r) => department === "all" || r.employee.departmentId === department,
  );
  const rows = all.filter(
    (r) =>
      filter === "all" ||
      (filter === "urgent"
        ? r.urgent
        : r.needsCheck || !r.employee.contractEndDate),
  );
  return (
    <section className="hr-control-panel" aria-label="Остатки и сроки">
      <div className="control-intro">
        <div>
          <p className="eyebrow">
            План {calendarYear} · На {formatDateRu(state.demoDate)}
          </p>
          <h2>Остатки и сроки</h2>
          <p>С кем обсудить отпуск и продление контракта в первую очередь.</p>
        </div>
      </div>
      <p className="balance-note">
        Окончание контракта — повод проверить планы, а не подтверждение
        увольнения. Отпуск согласовывается с сотрудником. Компенсация при
        увольнении рассчитывается отдельно: экономию система не определяет.
        Остатки ниже — по годовому праву и известному плану, не начисление на
        дату увольнения.
      </p>
      <div className="control-filters">
        <label>
          Срок внимания
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          >
            {[30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} дней
              </option>
            ))}
          </select>
        </label>
        <label>
          Подразделение остатков
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
        <button
          className={filter === "urgent" ? "active" : ""}
          onClick={() => setFilter("urgent")}
        >
          Требуют внимания ({all.filter((r) => r.urgent).length})
        </button>
        <button
          className={filter === "check" ? "active" : ""}
          onClick={() => setFilter("check")}
        >
          Уточнить данные
        </button>
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          Все сотрудники
        </button>
      </div>
      {!rows.length && (
        <p className="balance-note">
          Нет сотрудников по выбранному фильтру. Неизвестные сроки и неполные
          остатки проверьте в «Уточнить данные».
        </p>
      )}
      <div className="balance-roster">
        {rows.map((r) => (
          <article className="balance-person" key={r.employee.id}>
            <div className="control-section-heading">
              <div>
                <h3>{r.employee.name}</h3>
                <p>{r.employee.departmentName}</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  setEditing(r.employee);
                  setDate(r.employee.contractEndDate ?? "");
                }}
              >
                Изменить срок контракта
              </button>
            </div>
            <p>
              <strong>Контракт:</strong>{" "}
              {r.employee.contractEndDate
                ? `${formatDateRu(r.employee.contractEndDate)} · ${r.contractDays! < 0 ? "срок прошёл — уточните продление" : `до окончания ${r.contractDays} дн.`}`
                : "Дата не указана — уточните у кадров"}
            </p>
            {r.urgent && (
              <p className="deadline-alert">
                Приоритет: обсудить отпуск / продление и проверить кадровый
                остаток.
              </p>
            )}
            {r.scheduledAfterContract > 0 && (
              <p className="deadline-alert">
                После окончания контракта в плане {r.scheduledAfterContract} дн.
                Проверьте продление или даты отпуска.
              </p>
            )}
            {r.balances.map((b) => (
              <div className="balance-workyear" key={b.workYear.id}>
                <strong>
                  Рабочий год:{" "}
                  {formatDateRangeRu(b.workYear.startDate, b.workYear.endDate)}
                </strong>
                {daysUntil(state.demoDate, b.workYear.endDate) <= threshold && (
                  <p className="deadline-alert">
                    Подходит к концу или завершён рабочий год.
                  </p>
                )}
                <p>
                  Право {b.workYear.entitlementDays} · Использовано {b.used} · В
                  плане {b.planned} · Ждут решения {b.pending}
                </p>
                <p>
                  <strong>
                    Ещё не использовано:{" "}
                    {b.unused === null ? "нужна проверка" : `${b.unused} дн.`} ·
                    Осталось запланировать:{" "}
                    {b.remaining === null
                      ? "нужна проверка"
                      : `${b.remaining} дн.`}
                  </strong>
                </p>
                {!!b.overplanned && (
                  <p className="deadline-alert">
                    План превышает право на {b.overplanned} дн.
                  </p>
                )}
                {!b.complete && (
                  <p>
                    История неполна или не подтверждена привязка к рабочему
                    году. Не используйте оценку как кадровый остаток.
                  </p>
                )}
              </div>
            ))}
            {!r.balances.length && (
              <p>Нет данных рабочего года. Остаток неизвестен.</p>
            )}
          </article>
        ))}
      </div>
      <p className="muted">
        Показан план за весь выбранный год. Сроки контрактов можно
        уточнять, а изменения сохраняются в истории действий.
        Все данные демонстрационные.
      </p>
      {editing && (
        <div className="dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-title"
            className="simple-dialog"
          >
            <h2 id="contract-title">Срок контракта: {editing.name}</h2>
            <label>
              Дата окончания контракта
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <p>
              Пустое поле означает «дата неизвестна / не задана». Это не
              подтверждение бессрочного договора.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Отмена
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  try {
                    dispatch({
                      type: "UPDATE_CONTRACT",
                      payload: {
                        employeeId: editing.id,
                        contractEndDate: date || undefined,
                      },
                      actorId: currentUser.id,
                      actorName: currentUser.name,
                    });
                    setEditing(null);
                    showNotification(
                      "success",
                      "Срок контракта сохранён в журнале.",
                    );
                  } catch (e) {
                    showNotification("error", (e as Error).message);
                  }
                }}
              >
                Сохранить срок
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
