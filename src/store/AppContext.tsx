/**
 * Unified Application Context for LeaveFlow v2.0
 */

import React, { createContext, useContext, useEffect, useReducer, useState } from 'react';
import { AppState, Employee, Horizon, Role } from '../domain/types';
import { appReducer, AppAction } from '../domain/workflow';
import { loadSavedState, resetStoredState, saveCurrentState } from '../services/persistence';

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
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
  storageWarning: string | null;
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;
  showNotification: (type: 'success' | 'error' | 'info', message: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [initResult] = useState(() => loadSavedState());
  const [state, dispatch] = useReducer(appReducer, initResult.state);

  // Default active user is Ivan Morozov (MPP), default role 'employee'
  const [currentUserId, setCurrentUserId] = useState<string>('emp-mpp-3');
  const [currentRole, setCurrentRole] = useState<Role>('employee');

  // Horizon default H2, initial calendar month August (8) according to Section 12
  const [horizon, setHorizon] = useState<Horizon>('H2');
  const [calendarMonth, setCalendarMonth] = useState<number>(8);
  const calendarYear = 2027;

  const [storageWarning, setStorageWarning] = useState<string | null>(
    initResult.isCorrupted ? initResult.error || 'Данные повреждены' : null
  );

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((cur) => (cur?.message === message ? null : cur));
    }, 4500);
  };

  // Sync to localStorage on every state update
  useEffect(() => {
    const success = saveCurrentState(state);
    if (!success) {
      setStorageWarning('Изменения пока не сохранены в постоянное хранилище браузера.');
    } else if (storageWarning) {
      setStorageWarning(null);
    }
  }, [state]);

  const currentUser =
    state.employees.find((e) => e.id === currentUserId) || state.employees[0];

  const handleSetCurrentUser = (emp: Employee) => {
    setCurrentUserId(emp.id);
    // If user doesn't have HR role and currentRole is HR, fallback to employee
    if (currentRole === 'hr' && !emp.accessRoles.includes('hr')) {
      setCurrentRole('employee');
    }
  };

  const handleSetCurrentRole = (role: Role) => {
    if (role === 'hr') {
      // Find an HR employee if current doesn't have HR access
      if (!currentUser.accessRoles.includes('hr')) {
        const hrEmp = state.employees.find((e) => e.accessRoles.includes('hr'));
        if (hrEmp) {
          setCurrentUserId(hrEmp.id);
        }
      }
    }
    setCurrentRole(role);
  };

  const resetDemo = () => {
    const fresh = resetStoredState();
    dispatch({
      type: 'RESET_STATE',
      payload: { initialState: fresh },
      actorId: currentUser.id,
      actorName: currentUser.name,
    });
    setHorizon('H2');
    setCalendarMonth(8);
    setCurrentUserId('emp-mpp-3');
    setCurrentRole('employee');
    showNotification('info', 'Демо-данные успешно сброшены к исходному состоянию (Август 2027, II полугодие).');
  };

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        currentUser,
        setCurrentUser: handleSetCurrentUser,
        currentRole,
        setCurrentRole: handleSetCurrentRole,
        horizon,
        setHorizon,
        calendarMonth,
        setCalendarMonth,
        calendarYear,
        resetDemo,
        storageWarning,
        notification,
        showNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
