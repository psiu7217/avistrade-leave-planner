import React, { useState } from "react";
import { useApp } from "../store/AppContext";
import { CalendarDays, RotateCcw } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";
import { DEMO_DATA_VERSION } from "../data/seed";

export function Header() {
  const {
    currentUser,
    currentRole,
    setCurrentRole,
    setCurrentUser,
    state,
    resetDemo,
    storageWarning,
  } = useApp();
  const [confirm, setConfirm] = useState(false);
  useDialogFocus(confirm, () => setConfirm(false));
  return (
    <>
      <header className="app-header">
        <div className="app-header-main">
          <a href="#main-content" className="app-wordmark">
            <CalendarDays size={28} />
            <span>
              LeaveFlow <small>Авистрейд</small>
            </span>
          </a>
          <span className="header-context">
            {currentRole === "employee" ? "Личный кабинет" : "Кабинет HR"}
          </span>
          <details className="demo-controls">
            <summary>Демо-настройки</summary>
            <div className="demo-controls-popover">
              <label>
                Роль
                <select
                  value={currentRole}
                  onChange={(e) => setCurrentRole(e.target.value as any)}
                >
                  <option value="employee">Сотрудник</option>
                  <option value="hr">HR</option>
                </select>
              </label>
              <label>
                Пользователь
                <select
                  value={currentUser.id}
                  onChange={(e) => {
                    const employee = state.employees.find(
                      (x) => x.id === e.target.value,
                    );
                    if (employee) setCurrentUser(employee);
                  }}
                >
                  {state.employees
                    .filter(
                      (e) =>
                        e.active &&
                        (currentRole !== "hr" || e.accessRoles.includes("hr")),
                    )
                    .map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </label>
              <p>
                Здесь можно посмотреть систему глазами сотрудника или HR.
                Это демонстрация, а не вход в личную учётную запись.
              </p>
              <p>
                Заявки и изменения правил сохраняются в этом браузере до
                сброса демонстрации.
              </p>
              <button
                onClick={() => setConfirm(true)}
                className="secondary-button"
              >
                <RotateCcw size={16} /> Сбросить демо
              </button>
            </div>
          </details>
        </div>
        <div className="app-header-note">
          Демонстрация · Условная дата: 28 октября 2026 года · План на 2027 год
        </div>
      </header>
      {state.demoDataVersion !== DEMO_DATA_VERSION && !storageWarning && (
        <div className="demo-data-update" role="status">
          <div>
            <strong>Доступен полный набор для демонстрации</strong>
            <p>
              Можно открыть обновлённые примеры работы системы. При
              восстановлении исходных данных ваши текущие изменения будут
              заменены.
            </p>
          </div>
          <button className="primary-button" onClick={() => setConfirm(true)}>
            Загрузить полный демо-набор
          </button>
        </div>
      )}
      {storageWarning && (
        <div className="storage-warning" role="alert">
          <span>
            {storageWarning} Исходная сохранённая запись не перезаписывается при
            повреждении.
          </span>
          <button className="secondary-button" onClick={() => setConfirm(true)}>
            Сбросить с подтверждением
          </button>
        </div>
      )}
      {confirm && (
        <div className="dialog-backdrop">
          <section
            className="simple-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">Сбросить демо-данные?</h2>
            <p>
              Созданные пожелания и изменения правил будут заменены полным
              набором сценариев: сроки контрактов, замещение нескольких
              сотрудников, история, исключение и неоплачиваемые отпуска. Другие
              данные браузера останутся.
            </p>
            <div className="dialog-actions">
              <button
                autoFocus
                className="secondary-button"
                onClick={() => setConfirm(false)}
              >
                Отмена
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  resetDemo();
                  setConfirm(false);
                }}
              >
                Подтвердить сброс
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
