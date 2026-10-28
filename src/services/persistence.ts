/**
 * Persistence service for LeaveFlow v2.0
 * Conforms to Section 11.4 of the Technical Specification.
 */

import { INITIAL_STATE, STORAGE_KEY } from '../data/seed';
import { AppState } from '../domain/types';

export function loadSavedState(): { state: AppState; isCorrupted: boolean; error?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: cloneInitialState(), isCorrupted: false };
    }

    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.schemaVersion !== INITIAL_STATE.schemaVersion) {
      return {
        state: cloneInitialState(),
        isCorrupted: true,
        error: 'Версия сохраненных данных устарела. Рекомендуется сбросить демо-данные к исходному состоянию.',
      };
    }

    return { state: parsed, isCorrupted: false };
  } catch (err) {
    return {
      state: cloneInitialState(),
      isCorrupted: true,
      error: 'Не удалось прочитать локальное хранилище. Рекомендуется сбросить данные к исходным.',
    };
  }
}

export function saveCurrentState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('LocalStorage write failed:', err);
    return false;
  }
}

export function resetStoredState(): AppState {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('LocalStorage removeItem failed:', err);
  }
  return cloneInitialState();
}

export function cloneInitialState(): AppState {
  return JSON.parse(JSON.stringify(INITIAL_STATE));
}
