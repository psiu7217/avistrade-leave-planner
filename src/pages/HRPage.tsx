/**
 * HR Workspace Screen («Кабинет HR / Согласование отпусков»)
 * Conforms to Sections 4.2, 5, 6, 8, 9, 10.4 of the Technical Specification.
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import {
  areIntervalsOverlapping,
  compareDateStr,
  formatDateRangeRu,
  formatDateRu,
  getDateRangeArray,
  MONTH_NAMES_RU,
  pad2,
  WEEKDAYS_SHORT_RU,
} from '../domain/dates';
import {
  getMonthCalendarGrid,
  getMonthsForHorizon,
} from '../domain/calendarProjection';
import { validatePreference } from '../domain/validatePreference';
import { CorporateRule, Employee, Horizon, Preference } from '../domain/types';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Sliders,
  FileSpreadsheet,
  PlusCircle,
  HelpCircle,
  Calendar,
  History,
  ChevronLeft,
  ChevronRight,
  User,
  Filter,
  Download,
} from 'lucide-react';

export function HRPage({
  activeTab,
  setActiveTab,
}: {
  activeTab: 'calendar' | 'queue' | 'rules' | 'audit';
  setActiveTab: (tab: 'calendar' | 'queue' | 'rules' | 'audit') => void;
}) {
  const {
    state,
    dispatch,
    currentUser,
    horizon,
    setHorizon,
    calendarMonth,
    setCalendarMonth,
    calendarYear,
    showNotification,
  } = useApp();

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [queueFilter, setQueueFilter] = useState<'all' | 'submitted' | 'conflict' | 'approved'>('submitted');

  // Active Review Drawer / Modal
  const [reviewPreference, setReviewPreference] = useState<Preference | null>(null);
  const [exceptionReason, setExceptionReason] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [actionModalType, setActionModalType] = useState<'exception' | 'return' | 'reject' | null>(null);

  // Rule editing modal
  const [editingRule, setEditingRule] = useState<CorporateRule | null>(null);
  const [newRuleValue, setNewRuleValue] = useState<number>(0);
  const [ruleChangeReason, setRuleChangeReason] = useState<string>('');

  // P1: Create request on behalf of employee
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createEmployeeId, setCreateEmployeeId] = useState<string>(state.employees[0].id);
  const [createStartDate, setCreateStartDate] = useState<string>('2027-08-02');
  const [createEndDate, setCreateEndDate] = useState<string>('2027-08-15');
  const [createReplacementId, setCreateReplacementId] = useState<string>(state.employees[1].id);
  const [createComment, setCreateComment] = useState<string>('Создано специалистом HR');

  const horizonMonths = useMemo(() => getMonthsForHorizon(horizon), [horizon]);

  // Filtered employees for calendar
  const filteredEmployees = useMemo(() => {
    if (selectedDepartment === 'all') return state.employees;
    return state.employees.filter((e) => e.departmentId === selectedDepartment);
  }, [state.employees, selectedDepartment]);

  // Validation for currently reviewed preference
  const reviewValidation = useMemo(() => {
    if (!reviewPreference) return null;
    return validatePreference(reviewPreference, state, state.demoDate, reviewPreference.id);
  }, [reviewPreference, state]);

  // All preferences in queue
  const queuePreferences = useMemo(() => {
    const list = state.preferences.map((p) => {
      const emp = state.employees.find((e) => e.id === p.employeeId);
      const val = validatePreference(p, state, state.demoDate, p.id);
      return {
        preference: p,
        employee: emp,
        validation: val,
      };
    });

    if (queueFilter === 'submitted') {
      return list.filter((item) => item.preference.status === 'submitted');
    } else if (queueFilter === 'conflict') {
      return list.filter((item) => item.validation.hasCorporateConflicts || item.validation.hasLegalBlocks);
    } else if (queueFilter === 'approved') {
      return list.filter((item) => item.preference.status === 'approved');
    }
    return list;
  }, [state.preferences, state.employees, state, queueFilter]);

  // Handle normal approval
  const handleApproveNormally = (pref: Preference) => {
    try {
      dispatch({
        type: 'APPROVE_PREFERENCE',
        payload: { preferenceId: pref.id },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification('success', 'Пожелание успешно согласовано в рабочем плане.');
      setReviewPreference(null);
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка согласования');
    }
  };

  // Handle exception approval
  const handleApproveExceptionSubmit = () => {
    if (!reviewPreference) return;
    if ((exceptionReason || '').trim().length < 10) {
      showNotification('error', 'Основание для корпоративного исключения должно содержать не менее 10 символов.');
      return;
    }

    try {
      dispatch({
        type: 'APPROVE_EXCEPTION',
        payload: {
          preferenceId: reviewPreference.id,
          reason: exceptionReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification('success', 'Корпоративное исключение успешно согласовано с сохранением основания в аудите.');
      setActionModalType(null);
      setReviewPreference(null);
      setExceptionReason('');
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка исключения');
    }
  };

  // Handle return for correction
  const handleReturnSubmit = () => {
    if (!reviewPreference) return;
    if (!(returnReason || '').trim()) {
      showNotification('error', 'Укажите причину возврата на корректировку.');
      return;
    }

    try {
      dispatch({
        type: 'RETURN_PREFERENCE',
        payload: {
          preferenceId: reviewPreference.id,
          reason: returnReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification('info', 'Пожелание возвращено сотруднику на корректировку.');
      setActionModalType(null);
      setReviewPreference(null);
      setReturnReason('');
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка');
    }
  };

  // Handle rejection
  const handleRejectSubmit = () => {
    if (!reviewPreference) return;
    if (!(rejectionReason || '').trim()) {
      showNotification('error', 'Укажите причину отклонения.');
      return;
    }

    try {
      dispatch({
        type: 'REJECT_PREFERENCE',
        payload: {
          preferenceId: reviewPreference.id,
          reason: rejectionReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification('info', 'Пожелание отклонено.');
      setActionModalType(null);
      setReviewPreference(null);
      setRejectionReason('');
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка');
    }
  };

  // Rule edit modal submission
  const handleRuleSave = () => {
    if (!editingRule) return;
    if ((ruleChangeReason || '').trim().length < 10) {
      showNotification('error', 'Основание для изменения правила должно содержать не менее 10 символов.');
      return;
    }

    try {
      dispatch({
        type: 'UPDATE_RULE',
        payload: {
          code: editingRule.code,
          newValue: Number(newRuleValue),
          reason: ruleChangeReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification('success', `Правило "${editingRule.name}" успешно обновлено. Календарь пересчитан.`);
      setEditingRule(null);
      setRuleChangeReason('');
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка обновления правила');
    }
  };

  // P1: Create request on behalf of employee submit
  const handleCreateOnBehalf = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      dispatch({
        type: 'SUBMIT_PREFERENCE',
        payload: {
          employeeId: createEmployeeId,
          startDate: createStartDate,
          endDate: createEndDate,
          replacementEmployeeId: createReplacementId,
          comment: createComment,
          acknowledgedCodes: ['HR_SUBMITTED'],
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification('success', 'Пожелание успешно создано от имени сотрудника и добавлено в очередь.');
      setShowCreateModal(false);
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка создания');
    }
  };

  // P1: Export CSV handler
  const handleExportCSV = () => {
    const rows = [
      ['ID', 'Сотрудник', 'Должность', 'Отдел', 'Начало', 'Окончание', 'Календарных дней', 'Статус', 'Тип'],
    ];

    // Approved preferences
    state.preferences
      .filter((p) => p.status === 'approved')
      .forEach((p) => {
        const emp = state.employees.find((e) => e.id === p.employeeId);
        const days = getDateRangeArray(p.startDate, p.endDate).length;
        rows.push([
          p.id,
          emp ? emp.name : p.employeeId,
          emp ? emp.positionName : '',
          emp ? emp.departmentName : '',
          p.startDate,
          p.endDate,
          String(days),
          'Согласовано в плане',
          p.isException ? 'Корпоративное исключение' : 'Стандартный отпуск',
        ]);
      });

    // Existing absences
    state.existingAbsences.forEach((a) => {
      const emp = state.employees.find((e) => e.id === a.employeeId);
      const days = getDateRangeArray(a.startDate, a.endDate).length;
      rows.push([
        a.id,
        emp ? emp.name : a.employeeId,
        emp ? emp.positionName : '',
        emp ? emp.departmentName : '',
        a.startDate,
        a.endDate,
        String(days),
        'Подтвержденное отсутствие',
        a.note || a.type,
      ]);
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Avistrade_LeaveFlow_Plan_2027_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('info', 'Экспорт выгружен. Напоминание: файл является рабочим планом и не является официальным кадровым документом.');
  };

  // Month days for calendar table
  const daysInMonth = useMemo(() => {
    const total = new Date(Date.UTC(calendarYear, calendarMonth, 0)).getUTCDate();
    const arr: { dateStr: string; dayNum: number; isWeekend: boolean }[] = [];
    for (let d = 1; d <= total; d++) {
      const dateStr = `${calendarYear}-${pad2(calendarMonth)}-${pad2(d)}`;
      const dayDate = new Date(Date.UTC(calendarYear, calendarMonth - 1, d));
      let dow = dayDate.getUTCDay();
      if (dow === 0) dow = 7;
      arr.push({
        dateStr,
        dayNum: d,
        isWeekend: dow === 6 || dow === 7,
      });
    }
    return arr;
  }, [calendarYear, calendarMonth]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner: HR Context & Primary Tools */}
      <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Кабинет согласования отпусков</span>
            <span>·</span>
            <span>Служба по работе с персоналом</span>
          </div>
          <h1 className="text-xl font-bold text-[#34495E] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#007A60]" />
            <span>Панель управления графиком отпусков</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Ответственный: <span className="font-semibold text-slate-800">{currentUser.name}</span> (Ведущий HR-специалист)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 text-xs font-semibold text-[#007A60] bg-[#DCF5ED] hover:bg-[#C9EFE2] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Подать за сотрудника (P1)</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Выгрузить рабочий план в формате CSV"
          >
            <Download className="w-4 h-4" />
            <span>Экспорт в CSV (P1)</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'calendar'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Календарь команды</span>
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'queue'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Очередь пожеланий ({queuePreferences.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'rules'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Корпоративные правила</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Журнал аудита ({state.auditEvents.length})</span>
          </button>
        </div>

        {/* Global Horizon Selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 hidden sm:inline">Горизонт:</span>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as Horizon)}
            className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#00A882]"
          >
            <option value="H1">I полугодие 2027</option>
            <option value="H2">II полугодие 2027</option>
            <option value="ALL">Весь 2027 год</option>
          </select>
        </div>
      </div>

      {/* TAB 1: TEAM CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => calendarMonth > 1 && setCalendarMonth(calendarMonth - 1)}
                  disabled={calendarMonth <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-[#34495E] min-w-[130px] text-center">
                  {MONTH_NAMES_RU[calendarMonth - 1]} {calendarYear}
                </span>
                <button
                  onClick={() => calendarMonth < 12 && setCalendarMonth(calendarMonth + 1)}
                  disabled={calendarMonth >= 12}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Department filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#00A882]"
                >
                  <option value="all">Все отделы ({state.employees.length} сотр.)</option>
                  {state.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Calendar Legend */}
            <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#00A882]" />
                <span>Согласован</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-400" />
                <span>Ожидает HR</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#007A60] ring-2 ring-amber-400" />
                <span>Исключение</span>
              </span>
            </div>
          </div>

          {/* Table Matrix */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F6F8F7] border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold sticky left-0 bg-[#F6F8F7] z-10 w-48 border-r border-slate-200">
                    Сотрудник / Должность
                  </th>
                  {daysInMonth.map((d) => (
                    <th
                      key={d.dateStr}
                      className={`py-2 px-1 text-center font-semibold border-r border-slate-200 min-w-[28px] tabular-nums ${
                        d.isWeekend ? 'bg-slate-100 text-slate-500' : 'text-slate-700'
                      }`}
                    >
                      {d.dayNum}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                        <div className="font-bold text-[#34495E]">{emp.name}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[170px]">
                          {emp.positionCode} · {emp.departmentName}
                        </div>
                      </td>

                      {daysInMonth.map((d) => {
                        // Check if employee has confirmed leave or preference on date d
                        const confirmedLeave = state.existingAbsences.find(
                          (a) => a.employeeId === emp.id && areIntervalsOverlapping(a.startDate, a.endDate, d.dateStr, d.dateStr)
                        );
                        const preference = state.preferences.find(
                          (p) =>
                            p.employeeId === emp.id &&
                            p.status !== 'withdrawn' &&
                            p.status !== 'rejected' &&
                            areIntervalsOverlapping(p.startDate, p.endDate, d.dateStr, d.dateStr)
                        );

                        let cellClass = d.isWeekend ? 'bg-slate-50' : 'bg-white';
                        let cellContent = null;
                        let cellClick = undefined;

                        if (confirmedLeave) {
                          cellClass = 'bg-[#00A882]/80 hover:bg-[#00A882] text-white';
                          cellContent = <span className="text-[9px] font-bold">О</span>;
                        } else if (preference) {
                          if (preference.status === 'approved') {
                            cellClass = preference.isException
                              ? 'bg-[#007A60] ring-1 ring-amber-400 text-white font-bold'
                              : 'bg-[#00A882] text-white font-bold';
                            cellContent = <span className="text-[9px]">О</span>;
                            cellClick = () => setReviewPreference(preference);
                          } else if (preference.status === 'submitted') {
                            cellClass = 'bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold cursor-pointer';
                            cellContent = <span className="text-[9px]">?</span>;
                            cellClick = () => setReviewPreference(preference);
                          }
                        }

                        return (
                          <td
                            key={d.dateStr}
                            onClick={cellClick}
                            className={`p-0 text-center border-r border-slate-200 h-9 transition-colors select-none ${cellClass}`}
                            title={`${emp.name}: ${d.dateStr}`}
                          >
                            <div className="w-full h-full flex items-center justify-center">
                              {cellContent}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REQUESTS QUEUE */}
      {activeTab === 'queue' && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          {/* Filter Pills */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 bg-[#F6F8F7] p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setQueueFilter('submitted')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === 'submitted'
                    ? 'bg-[#007A60] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ожидают решения ({state.preferences.filter((p) => p.status === 'submitted').length})
              </button>
              <button
                onClick={() => setQueueFilter('conflict')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === 'conflict'
                    ? 'bg-[#007A60] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                С конфликтами
              </button>
              <button
                onClick={() => setQueueFilter('approved')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === 'approved'
                    ? 'bg-[#007A60] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Согласованные в плане
              </button>
              <button
                onClick={() => setQueueFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === 'all'
                    ? 'bg-[#007A60] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Все пожелания ({state.preferences.length})
              </button>
            </div>
          </div>

          {/* Table */}
          {queuePreferences.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Пожеланий по выбранному фильтру не найдено.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-3 font-semibold">Сотрудник</th>
                    <th className="py-2.5 px-3 font-semibold">Период & Дни</th>
                    <th className="py-2.5 px-3 font-semibold">Выявленные проверки</th>
                    <th className="py-2.5 px-3 font-semibold">Статус</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queuePreferences.map(({ preference, employee, validation }) => {
                    const empName = employee ? employee.name : preference.employeeId;
                    const posName = employee ? employee.positionName : '';

                    let statusBadge = null;
                    if (preference.status === 'approved') {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#116149] bg-[#DCF5ED] px-2 py-0.5 rounded text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          Согласовано
                          {preference.isException && ' (исключение)'}
                        </span>
                      );
                    } else if (preference.status === 'submitted') {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                          <Clock className="w-3 h-3" />
                          Ожидает HR
                        </span>
                      );
                    } else if (preference.status === 'returned') {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-200 px-2 py-0.5 rounded text-[11px]">
                          На корректировке
                        </span>
                      );
                    } else if (preference.status === 'rejected') {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded text-[11px]">
                          Отклонено
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="text-slate-400 font-medium">{preference.status}</span>
                      );
                    }

                    return (
                      <tr key={preference.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#34495E]">{empName}</div>
                          <div className="text-[11px] text-slate-500">{posName}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {formatDateRangeRu(preference.startDate, preference.endDate)}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {validation.absenceDays} календ. дн. ({validation.leaveDays} дн. трудового)
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-sm">
                          <div className="flex flex-col gap-1">
                            {validation.results.map((r, idx) => (
                              <div
                                key={idx}
                                className={`text-[11px] leading-tight flex items-start gap-1 ${
                                  r.kind === 'corporate_conflict'
                                    ? 'text-amber-800 font-medium'
                                    : r.kind === 'legal_block'
                                    ? 'text-red-700 font-bold'
                                    : r.kind === 'legal_review'
                                    ? 'text-amber-700'
                                    : 'text-slate-600'
                                }`}
                              >
                                <span>•</span>
                                <span>{r.message}</span>
                              </div>
                            ))}
                            {validation.results.length === 0 && (
                              <span className="text-[11px] text-[#007A60] font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Без ограничений
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">{statusBadge}</td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => setReviewPreference(preference)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg transition-colors cursor-pointer"
                          >
                            Рассмотреть
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CORPORATE RULES MANAGEMENT */}
      {activeTab === 'rules' && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#34495E]">
              Управление корпоративными правилами отпусков
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              HR управляет параметрами регламента ООО «Авистрейд». Изменение любого параметра требует
              обязательного основания (не менее 10 символов), увеличивает версию правила и регистрируется в
              журнале аудита с пересчетом графика.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(state.corporateRules).map((rule) => {
              return (
                <div
                  key={rule.code}
                  className="p-4 rounded-xl border border-slate-200 bg-[#F6F8F7] flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[#007A60]">{rule.code}</span>
                      <span className="text-[11px] text-slate-500 font-mono">v{rule.version}</span>
                    </div>
                    <h3 className="text-sm font-bold text-[#34495E]">{rule.name}</h3>
                    <p className="text-xs text-slate-600 mt-1 leading-snug">{rule.description}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Текущее значение</span>
                      <span className="text-xl font-bold text-slate-900 tabular-nums">
                        {rule.value} {rule.code === 'noticeMonths' ? 'мес.' : 'дн./чел.'}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRule(rule);
                        setNewRuleValue(rule.value);
                        setRuleChangeReason('');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg transition-colors cursor-pointer"
                    >
                      Изменить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#34495E]">
              Журнал аудита действий и решений
            </h2>
            <span className="text-xs text-slate-500">
              Событий: {state.auditEvents.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-semibold">Время (UTC)</th>
                  <th className="py-2.5 px-3 font-semibold">Инициатор</th>
                  <th className="py-2.5 px-3 font-semibold">Действие</th>
                  <th className="py-2.5 px-3 font-semibold">Описание</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {state.auditEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">
                      {evt.createdAt.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-sans font-semibold text-slate-800">
                      {evt.actorName}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                        {evt.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      {evt.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REVIEW DRAWER / MODAL FOR PREFERENCE */}
      {reviewPreference && reviewValidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-[#34495E]">
                  Рассмотрение пожелания на отпуск #{reviewPreference.id}
                </h3>
                <p className="text-xs text-slate-500">
                  Сотрудник:{' '}
                  <span className="font-semibold text-slate-800">
                    {state.employees.find((e) => e.id === reviewPreference.employeeId)?.name}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setReviewPreference(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Request Details Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[#F6F8F7] rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Период</span>
                <span className="font-bold text-slate-900">
                  {formatDateRangeRu(reviewPreference.startDate, reviewPreference.endDate)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Трудовой отпуск</span>
                <span className="font-bold text-[#007A60] tabular-nums">
                  {reviewValidation.leaveDays} дн.
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Летний расход</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {reviewValidation.summerDays} из {reviewValidation.summerLimit} дн.
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Текущий статус</span>
                <span className="font-bold text-amber-900">
                  {reviewPreference.status}
                </span>
              </div>
            </div>

            {/* Validation Findings for HR (names and exact days revealed!) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700">
                Результаты проверки по регламенту и ТК РБ:
              </h4>

              {reviewValidation.results.map((r, idx) => {
                let badge = 'bg-slate-50 border-slate-200 text-slate-700';
                if (r.kind === 'corporate_conflict') badge = 'bg-[#FFF3D6] border-amber-300 text-amber-900';
                if (r.kind === 'legal_block') badge = 'bg-[#FDEBED] border-red-300 text-red-800';
                if (r.kind === 'legal_review') badge = 'bg-amber-50 border-amber-300 text-amber-900';

                return (
                  <div key={idx} className={`p-3 rounded-lg border text-xs leading-relaxed ${badge}`}>
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>{r.code}: {r.kind}</span>
                      {r.sourceRef && <span className="text-[10px] opacity-75">{r.sourceRef}</span>}
                    </div>
                    <p>{r.message}</p>
                    {r.conflictingEmployeeIds && r.conflictingEmployeeIds.length > 0 && (
                      <div className="mt-1 text-[11px] font-semibold">
                        Конфликтующие сотрудники в графике:{' '}
                        {r.conflictingEmployeeIds
                          .map((id) => state.employees.find((e) => e.id === id)?.name || id)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}

              {reviewValidation.results.length === 0 && (
                <div className="p-3 rounded-lg bg-[#DCF5ED] text-[#116149] text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#00A882]" />
                  <span>Все проверки пройдены: ограничений не выявлено. Доступно обычное согласование.</span>
                </div>
              )}
            </div>

            {/* If employee confirmed conflict upon submission */}
            {reviewPreference.acknowledgement && (
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                ✓ Сотрудник подтвердил понимание ограничений при подаче:{' '}
                <span className="font-semibold">{reviewPreference.acknowledgement.confirmedCodes.join(', ')}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionModalType('reject')}
                className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                Отклонить
              </button>

              <button
                type="button"
                onClick={() => setActionModalType('return')}
                className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
              >
                Вернуть на корректировку
              </button>

              {/* Corporate Exception Approval */}
              {reviewValidation.canApproveAsException && (
                <button
                  type="button"
                  onClick={() => {
                    setActionModalType('exception');
                    setExceptionReason('Обеспечено усиление дежурным менеджером на период отсутствия');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg transition-colors shadow-xs"
                >
                  Согласовать исключение
                </button>
              )}

              {/* Normal Approval */}
              {reviewValidation.canApproveNormally && (
                <button
                  type="button"
                  onClick={() => handleApproveNormally(reviewPreference)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg transition-colors shadow-xs"
                >
                  Согласовать в плане
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCEPTION APPROVAL REASON PROMPT */}
      {actionModalType === 'exception' && reviewPreference && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-[#34495E]">
              Основание корпоративного исключения
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              По регламенту ООО «Авистрейд» согласование исключения требует фиксации обоснованной
              производственной необходимости (не менее 10 символов). Данные фиксируются в неизменяемом
              журнале аудита.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Основание решения (обязательно)
              </label>
              <textarea
                rows={3}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                placeholder="Например: Обеспечено замещение дежурным менеджером, производственные задачи закрыты"
                className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#00A882]"
              />
              <span className="text-[10px] text-slate-400">
                Символов: {exceptionReason.trim().length} / мин. 10
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModalType(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={exceptionReason.trim().length < 10}
                onClick={handleApproveExceptionSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] disabled:opacity-40 rounded-lg shadow-xs"
              >
                Подтвердить исключение
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RETURN REASON PROMPT */}
      {actionModalType === 'return' && reviewPreference && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-[#34495E]">
              Возврат пожелания на корректировку
            </h3>
            <p className="text-xs text-slate-600">
              Сотрудник увидит эту причину в личном плане и сможет скорректировать даты или замещающего.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Причина возврата
              </label>
              <textarea
                rows={3}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Например: Пожалуйста, сдвиньте период на неделю вперед из-за пика отгрузок"
                className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#00A882]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModalType(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!returnReason.trim()}
                onClick={handleReturnSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-40 rounded-lg shadow-xs"
              >
                Вернуть сотруднику
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REJECT REASON PROMPT */}
      {actionModalType === 'reject' && reviewPreference && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-red-700">
              Отклонение пожелания
            </h3>
            <p className="text-xs text-slate-600">
              Укажите причину окончательного отклонения пожелания.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Основание отклонения
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Причина отклонения пожелания"
                className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#00A882]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModalType(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={handleRejectSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-40 rounded-lg shadow-xs"
              >
                Отклонить пожелание
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT CORPORATE RULE */}
      {editingRule && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-[#34495E]">
              Изменение корпоративного правила ({editingRule.code})
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Текущая версия: <span className="font-semibold">v{editingRule.version}</span>. После сохранения
              версия увеличится до <span className="font-semibold">v{editingRule.version + 1}</span>, а
              очередь и календарь будут мгновенно пересчитаны.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Новое значение параметра
              </label>
              <input
                type="number"
                min={editingRule.code === 'noticeMonths' ? 0 : 1}
                max={editingRule.code === 'summerMaxDays' ? 92 : 10}
                value={newRuleValue}
                onChange={(e) => setNewRuleValue(Number(e.target.value))}
                className="w-full text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#00A882]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Основание изменения (обязательно)
              </label>
              <textarea
                rows={3}
                value={ruleChangeReason}
                onChange={(e) => setRuleChangeReason(e.target.value)}
                placeholder="Например: Решение дирекции №14 о расширении штата и увеличении лимита МПП с 2 до 3"
                className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#00A882]"
              />
              <span className="text-[10px] text-slate-400">
                Символов: {ruleChangeReason.trim().length} / мин. 10
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={ruleChangeReason.trim().length < 10}
                onClick={handleRuleSave}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] disabled:opacity-40 rounded-lg shadow-xs"
              >
                Сохранить правило
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE ON BEHALF OF EMPLOYEE (P1) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-[#34495E]">
              Подать пожелание от имени сотрудника (P1)
            </h3>
            <form onSubmit={handleCreateOnBehalf} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Сотрудник
                </label>
                <select
                  value={createEmployeeId}
                  onChange={(e) => setCreateEmployeeId(e.target.value)}
                  className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2"
                >
                  {state.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.positionCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Начало
                  </label>
                  <input
                    type="date"
                    value={createStartDate}
                    onChange={(e) => setCreateStartDate(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Конец
                  </label>
                  <input
                    type="date"
                    value={createEndDate}
                    onChange={(e) => setCreateEndDate(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Замещающий
                </label>
                <select
                  value={createReplacementId}
                  onChange={(e) => setCreateReplacementId(e.target.value)}
                  className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2"
                >
                  {state.employees
                    .filter((e) => e.id !== createEmployeeId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Комментарий
                </label>
                <input
                  type="text"
                  value={createComment}
                  onChange={(e) => setCreateComment(e.target.value)}
                  className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg shadow-xs"
                >
                  Создать и отправить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
