import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Employee, Horizon, Role } from "../domain/types";
import { appReducer, AppAction } from "../domain/workflow";
import {
  loadSavedState,
  resetStoredState,
  saveCurrentState,
} from "../services/persistence";
import { getMonthsForHorizon } from "../domain/calendarProjection";

interface AppContextType {
  state: AppState;
  dispatch: (action: AppAction) => void;
  currentUser: Employee;
  setCurrentUser: (emp: Employee) => void;
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  horizon: Horizon;
  setHorizon: (h: Horizon) => void;
  calendarMonth: number;
  setCalendarMonth: (m: number) => void;
  calendarYear: number;
  resetDemo: () => void;
  resetVersion: number;
  storageWarning: string | null;
  notification: { type: "success" | "error" | "info"; message: string } | null;
  showNotification: (
    type: "success" | "error" | "info",
    message: string,
  ) => void;
}
const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(loadSavedState);
  const [state, setState] = useState(initial.state);
  const stateRef = useRef(state);
  const blockedStorage = useRef(initial.isCorrupted);
  const [storageWarning, setStorageWarning] = useState<string | null>(
    initial.error ?? null,
  );
  const [employeeId, setEmployeeId] = useState("emp-mpp-3");
  const [hrId, setHrId] = useState("emp-hr");
  const [currentRole, setRole] = useState<Role>("employee");
  const [horizon, setHorizonValue] = useState<Horizon>("H2");
  const horizonRef = useRef<Horizon>("H2");
  const [calendarMonth, setMonth] = useState(8);
  const [resetVersion, setResetVersion] = useState(0);
  const [notification, setNotification] =
    useState<AppContextType["notification"]>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Run commands synchronously so the form catches validation errors before React rendering.
  const dispatch = (action: AppAction) => {
    const next = appReducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    if (!blockedStorage.current) {
      setStorageWarning(
        saveCurrentState(next)
          ? null
          : "Изменения не сохранены после перезагрузки. Проверьте доступ к хранилищу браузера.",
      );
    }
  };
  const showNotification: AppContextType["showNotification"] = (
    type,
    message,
  ) => {
    clearTimeout(timer.current);
    setNotification({ type, message });
    timer.current = setTimeout(() => setNotification(null), 5000);
  };
  const currentUser =
    state.employees.find(
      (e) => e.id === (currentRole === "hr" ? hrId : employeeId),
    ) ?? state.employees[0];
  const setCurrentUser = (employee: Employee) => {
    if (!employee.active) return;
    if (currentRole === "hr") {
      if (employee.accessRoles.includes("hr")) setHrId(employee.id);
    } else setEmployeeId(employee.id);
  };
  const setCurrentRole = (role: Role) => {
    if (
      role === "hr" &&
      !state.employees.some((e) => e.active && e.accessRoles.includes("hr"))
    )
      return;
    setRole(role);
  };
  const setHorizon = (value: Horizon) => {
    horizonRef.current = value;
    setHorizonValue(value);
    const months = getMonthsForHorizon(value);
    if (!months.includes(calendarMonth)) setMonth(months[0]);
  };
  const setCalendarMonth = (month: number) => {
    if (getMonthsForHorizon(horizonRef.current).includes(month))
      setMonth(month);
  };
  const resetDemo = () => {
    const fresh = resetStoredState();
    blockedStorage.current = false;
    stateRef.current = fresh;
    setState(fresh);
    setStorageWarning(
      saveCurrentState(fresh)
        ? null
        : "Не удалось сохранить сброс. Хранилище браузера недоступно.",
    );
    setEmployeeId("emp-mpp-3");
    setHrId("emp-hr");
    setRole("employee");
    horizonRef.current = "H2";
    setHorizonValue("H2");
    setMonth(8);
    setResetVersion((v) => v + 1);
    showNotification("info", "Демо-данные восстановлены.");
  };
  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        currentUser,
        setCurrentUser,
        currentRole,
        setCurrentRole,
        horizon,
        setHorizon,
        calendarMonth,
        setCalendarMonth,
        calendarYear: 2027,
        resetDemo,
        resetVersion,
        storageWarning,
        notification,
        showNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp requires AppProvider");
  return context;
}
