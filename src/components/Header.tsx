/**
 * Top navigation bar conforming to Avistrade Brand Guidelines and Top Bar Contract.
 */

import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Role } from '../domain/types';
import {
  Calendar,
  RotateCcw,
  User,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  Info,
} from 'lucide-react';

export function Header({
  activeHRTab,
  setActiveHRTab,
}: {
  activeHRTab: 'calendar' | 'queue' | 'rules' | 'audit';
  setActiveHRTab: (tab: 'calendar' | 'queue' | 'rules' | 'audit') => void;
}) {
  const {
    currentUser,
    setCurrentUser,
    currentRole,
    setCurrentRole,
    state,
    resetDemo,
    storageWarning,
  } = useApp();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Count pending requests for HR badge
  const pendingCount = state.preferences.filter((p) => p.status === 'submitted').length;

  return (
    <>
      <header className="bg-[#34495E] text-white border-b border-[#2C3E50] sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Zone 1: Brand Wordmark */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-[#00A882] flex items-center justify-center font-bold text-white text-lg tracking-wider shadow-sm">
                LF
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
                    LeaveFlow
                  </span>
                  <span className="text-xs text-[#DCF5ED] font-medium tracking-wide bg-[#007A60] px-1.5 py-0.5 rounded">
                    ООО «Авистрейд»
                  </span>
                </div>
                <span className="text-[11px] text-slate-300 whitespace-nowrap">
                  Планирование отпусков 2027
                </span>
              </div>
            </div>

            {/* Zone 2: Navigation Links / Workspace Tabs */}
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {currentRole === 'employee' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2C3E50] rounded-md text-slate-200 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-[#00A882]" />
                  <span>Личный план сотрудника</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-300">2027 год</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-[#2C3E50] p-1 rounded-lg">
                  <button
                    onClick={() => setActiveHRTab('calendar')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeHRTab === 'calendar'
                        ? 'bg-[#007A60] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Календарь команды
                  </button>
                  <button
                    onClick={() => setActiveHRTab('queue')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      activeHRTab === 'queue'
                        ? 'bg-[#007A60] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>Очередь пожеланий</span>
                    {pendingCount > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] bg-[#00A882] text-white font-bold rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveHRTab('rules')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeHRTab === 'rules'
                        ? 'bg-[#007A60] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Корпоративные правила
                  </button>
                  <button
                    onClick={() => setActiveHRTab('audit')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeHRTab === 'audit'
                        ? 'bg-[#007A60] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Журнал аудита
                  </button>
                </div>
              )}
            </nav>

            {/* Zone 3: Switchers, Demo Info & Actions */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Role Switcher */}
              <div className="flex items-center bg-[#2C3E50] p-0.5 rounded-lg border border-[#3E5369]">
                <button
                  onClick={() => setCurrentRole('employee')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    currentRole === 'employee'
                      ? 'bg-[#007A60] text-white font-semibold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Сотрудник</span>
                </button>
                <button
                  onClick={() => setCurrentRole('hr')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    currentRole === 'hr'
                      ? 'bg-[#007A60] text-white font-semibold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00A882]" />
                  <span>HR</span>
                </button>
              </div>

              {/* Employee Selector (Demo purpose) */}
              <div className="relative hidden sm:block">
                <select
                  value={currentUser.id}
                  onChange={(e) => {
                    const emp = state.employees.find((x) => x.id === e.target.value);
                    if (emp) setCurrentUser(emp);
                  }}
                  className="bg-[#2C3E50] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 border border-[#3E5369] focus:outline-hidden focus:ring-1 focus:ring-[#00A882] max-w-[190px] truncate cursor-pointer"
                  title="Переключить выбранного сотрудника"
                >
                  {state.employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-[#34495E] text-white">
                      {emp.name} ({emp.positionCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Demo Reset Button */}
              <button
                onClick={() => setShowResetConfirm(true)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-[#2C3E50] rounded-lg transition-colors"
                title="Сбросить демо-данные к исходному состоянию"
                aria-label="Сбросить демо"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Sub-bar: Demo Context & Storage Status */}
        <div className="bg-[#243342] text-[11px] text-slate-300 border-t border-[#2C3E50] px-4 sm:px-6 lg:px-8 py-1">
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[#00A882]">Демо-дата: 28.10.2026</span>
              <span className="text-slate-500">|</span>
              <span>План на 2027 год</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">Данные хранятся в этом браузере (localStorage)</span>
            </div>
            {storageWarning && (
              <span className="text-amber-400 flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {storageWarning}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Confirmation Modal for Reset */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-[#34495E] mb-2 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-[#007A60]" />
              Сброс демо-данных
            </h3>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Вы хотите восстановить исходный seed-набор ООО «Авистрейд»? Все созданные в этой сессии
              пожелания, согласованные исключения и изменения параметров будут возвращены к
              первоначальному состоянию (Август 2027).
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  resetDemo();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg transition-colors"
              >
                Подтвердить сброс
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
