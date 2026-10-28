/**
 * Employee Screen («Мой план отпусков»)
 * Conforms to Sections 4.1, 7, 8, 10.3 of the Technical Specification.
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
  getEmployeeDateSummary,
  getMonthCalendarGrid,
  getMonthsForHorizon,
} from '../domain/calendarProjection';
import { validatePreference } from '../domain/validatePreference';
import { Horizon, Preference } from '../domain/types';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Send,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from 'lucide-react';

export function EmployeePage() {
  const {
    currentUser,
    state,
    dispatch,
    horizon,
    setHorizon,
    calendarMonth,
    setCalendarMonth,
    calendarYear,
    showNotification,
  } = useApp();

  // Selected date range in form
  const [startDate, setStartDate] = useState<string>('2027-08-23');
  const [endDate, setEndDate] = useState<string>('2027-08-29');
  const [replacementId, setReplacementId] = useState<string>(() => {
    const repl = state.employees.find((e) => e.id !== currentUser.id && e.active);
    return repl ? repl.id : '';
  });
  const [comment, setComment] = useState<string>('Планируемый летний период');
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [editingPreferenceId, setEditingPreferenceId] = useState<string | null>(null);

  // Month navigation within horizon
  const horizonMonths = useMemo(() => getMonthsForHorizon(horizon), [horizon]);

  const handlePrevMonth = () => {
    if (calendarMonth > 1) {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth < 12) {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  // Quick preset button for Demo scenario
  const setDemoDatesAug = () => {
    setStartDate('2027-08-23');
    setEndDate('2027-08-29');
    setCalendarMonth(8);
    setAcknowledged(false);
    showNotification('info', 'Выбраны демонстрационные даты: 23–29 августа 2027 г.');
  };

  // Active replacement candidates (active employees excluding self)
  const replacementCandidates = useMemo(
    () => state.employees.filter((e) => e.active && e.id !== currentUser.id),
    [state.employees, currentUser.id]
  );

  // Real-time validation candidate
  const candidate = useMemo(
    () => ({
      id: editingPreferenceId || undefined,
      employeeId: currentUser.id,
      startDate,
      endDate,
      replacementEmployeeId: replacementId,
      comment,
      submittedAt: new Date().toISOString(),
    }),
    [editingPreferenceId, currentUser.id, startDate, endDate, replacementId, comment]
  );

  const validation = useMemo(
    () => validatePreference(candidate, state, state.demoDate, editingPreferenceId || undefined),
    [candidate, state, editingPreferenceId]
  );

  // When dates change, reset acknowledgement if new impediments emerge
  const handleDateChange = (newStart: string, newEnd: string) => {
    setStartDate(newStart);
    setEndDate(newEnd);
    setAcknowledged(false);
  };

  // Month grid
  const monthWeeks = useMemo(
    () => getMonthCalendarGrid(calendarYear, calendarMonth, state.demoDate),
    [calendarYear, calendarMonth, state.demoDate]
  );

  // Selection dates array
  const selectedDatesArray = useMemo(
    () => (startDate && endDate && compareDateStr(startDate, endDate) <= 0
      ? getDateRangeArray(startDate, endDate)
      : []),
    [startDate, endDate]
  );

  // Handle day click on calendar:
  // If clicking outside current selection, set as start date. If clicking after start, set end date.
  const handleDayClick = (dateStr: string) => {
    if (!startDate || (startDate && endDate && startDate !== endDate)) {
      setStartDate(dateStr);
      setEndDate(dateStr);
      setAcknowledged(false);
    } else {
      if (compareDateStr(dateStr, startDate) >= 0) {
        setEndDate(dateStr);
      } else {
        setStartDate(dateStr);
        setEndDate(startDate);
      }
      setAcknowledged(false);
    }
  };

  // Submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation.hasInputErrors) {
      showNotification('error', 'Исправьте ошибки в форме перед отправкой.');
      return;
    }

    if (validation.requiresAcknowledgement && !acknowledged) {
      showNotification('error', 'Необходимо подтвердить понимание выявленных ограничений.');
      return;
    }

    try {
      dispatch({
        type: 'SUBMIT_PREFERENCE',
        payload: {
          id: editingPreferenceId || undefined,
          employeeId: currentUser.id,
          startDate,
          endDate,
          replacementEmployeeId: replacementId,
          comment,
          acknowledgedCodes: validation.requiresAcknowledgement
            ? validation.results.map((r) => r.code)
            : undefined,
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });

      showNotification('success', 'Пожелание успешно отправлено на рассмотрение HR.');
      setEditingPreferenceId(null);
      setAcknowledged(false);
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка отправки');
    }
  };

  // Save Draft handler
  const handleSaveDraft = () => {
    try {
      dispatch({
        type: 'SAVE_DRAFT',
        payload: {
          id: editingPreferenceId || undefined,
          employeeId: currentUser.id,
          startDate,
          endDate,
          replacementEmployeeId: replacementId,
          comment,
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });

      showNotification('info', 'Черновик пожелания сохранен.');
      setEditingPreferenceId(null);
    } catch (err: any) {
      showNotification('error', err.message || 'Ошибка сохранения');
    }
  };

  // Withdraw handler
  const handleWithdraw = (prefId: string) => {
    dispatch({
      type: 'WITHDRAW_PREFERENCE',
      payload: { preferenceId: prefId },
      actorId: currentUser.id,
      actorName: currentUser.name,
    });
    showNotification('info', 'Пожелание отозвано.');
  };

  // Load request into form for editing
  const handleEditPreference = (pref: Preference) => {
    setEditingPreferenceId(pref.id);
    setStartDate(pref.startDate);
    setEndDate(pref.endDate);
    setReplacementId(pref.replacementEmployeeId);
    setComment(pref.comment || '');
    setAcknowledged(false);

    const m = parseInt(pref.startDate.slice(5, 7), 10);
    setCalendarMonth(m);
    showNotification('info', 'Пожелание загружено в форму для корректировки.');
  };

  // Filter employee's own preferences and absences in chosen horizon
  const ownItems = useMemo(() => {
    const hStart = horizon === 'H1' ? '2027-01-01' : horizon === 'H2' ? '2027-07-01' : '2027-01-01';
    const hEnd = horizon === 'H1' ? '2027-06-30' : horizon === 'H2' ? '2027-12-31' : '2027-12-31';

    // Existing absences
    const absList = state.existingAbsences
      .filter((a) => a.employeeId === currentUser.id && areIntervalsOverlapping(a.startDate, a.endDate, hStart, hEnd))
      .map((a) => ({
        id: a.id,
        isExistingAbsence: true,
        startDate: a.startDate,
        endDate: a.endDate,
        comment: a.note || 'Плановое отсутствие',
        status: 'approved' as const,
        isException: false,
        returnReason: undefined,
        rejectionReason: undefined,
        prefRef: null as Preference | null,
      }));

    // Preferences
    const prefList = state.preferences
      .filter((p) => p.employeeId === currentUser.id && areIntervalsOverlapping(p.startDate, p.endDate, hStart, hEnd))
      .map((p) => ({
        id: p.id,
        isExistingAbsence: false,
        startDate: p.startDate,
        endDate: p.endDate,
        comment: p.comment,
        status: p.status,
        isException: !!p.isException,
        returnReason: p.returnReason,
        rejectionReason: p.rejectionReason,
        prefRef: p,
      }));

    return [...absList, ...prefList].sort((a, b) => compareDateStr(a.startDate, b.startDate));
  }, [state.existingAbsences, state.preferences, currentUser.id, horizon]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Employee Kicker / Context Card */}
      <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>{currentUser.departmentName}</span>
            <span>·</span>
            <span>Табельный № {currentUser.id.replace('emp-', '')}</span>
          </div>
          <h1 className="text-xl font-bold text-[#34495E] flex items-center gap-2">
            <span>Мой план отпусков: {currentUser.name}</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Должность: <span className="font-semibold text-slate-800">{currentUser.positionName}</span>
          </p>
        </div>

        {/* Horizon Segmented Control */}
        <div className="flex items-center bg-[#F6F8F7] p-1 rounded-lg border border-[#D7DFDC] self-start md:self-center">
          <button
            onClick={() => {
              setHorizon('H1');
              setCalendarMonth(2); // Feb 2027
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              horizon === 'H1'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            I полугодие (янв–июн)
          </button>
          <button
            onClick={() => {
              setHorizon('H2');
              setCalendarMonth(8); // Aug 2027
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              horizon === 'H2'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            II полугодие (июл–дек)
          </button>
          <button
            onClick={() => {
              setHorizon('ALL');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              horizon === 'ALL'
                ? 'bg-[#007A60] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Весь 2027 год
          </button>
        </div>
      </div>

      {/* Main Grid: Calendar on Left, Request Form on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Month Calendar (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#007A60]" />
              <h2 className="text-base font-bold text-[#34495E]">
                {MONTH_NAMES_RU[calendarMonth - 1]} {calendarYear}
              </h2>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrevMonth}
                disabled={calendarMonth <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Предыдущий месяц"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(Number(e.target.value))}
                className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-[#00A882]"
              >
                {horizonMonths.map((m) => (
                  <option key={m} value={m}>
                    {MONTH_NAMES_RU[m - 1]}
                  </option>
                ))}
              </select>
              <button
                onClick={handleNextMonth}
                disabled={calendarMonth >= 12}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Следующий месяц"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center border-b border-slate-100 pb-2">
            {WEEKDAYS_SHORT_RU.map((day, idx) => (
              <div
                key={day}
                className={`text-[11px] font-bold tracking-wider ${
                  idx >= 5 ? 'text-amber-800' : 'text-slate-500'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day Cells Grid */}
          <div className="space-y-1">
            {monthWeeks.map((week, wIdx) => (
              <div key={wIdx} className="grid grid-cols-7 gap-1">
                {week.map((cell) => {
                  const summary = getEmployeeDateSummary(currentUser.id, cell.dateStr, state);
                  const isSelected = selectedDatesArray.includes(cell.dateStr);

                  // Styling determinations
                  let cellBg = 'bg-white hover:bg-slate-50';
                  let textColor = 'text-slate-800';
                  let borderStyle = 'border border-slate-100';

                  if (!cell.isCurrentMonth) {
                    textColor = 'text-slate-300';
                    cellBg = 'bg-slate-50/50';
                  } else if (cell.isHoliday) {
                    cellBg = 'bg-[#ECECEC] hover:bg-slate-200';
                    textColor = 'text-red-700 font-bold';
                  } else if (cell.isWeekend) {
                    cellBg = 'bg-[#FAFBFB] hover:bg-slate-100';
                    textColor = 'text-slate-600';
                  }

                  // Selection takes visual highlight
                  if (isSelected) {
                    cellBg = 'bg-[#DCF5ED] hover:bg-[#C9EFE2]';
                    borderStyle = 'border-2 border-[#00A882] shadow-xs';
                    textColor = 'text-[#007A60] font-bold';
                  } else if (summary.myStatus === 'approved' || summary.myStatus === 'approved_exception') {
                    cellBg = 'bg-[#E3F4EB] hover:bg-[#D4EEDE]';
                    borderStyle = 'border border-[#00A882]/40';
                    textColor = 'text-[#007A60] font-bold';
                  } else if (summary.myStatus === 'submitted') {
                    cellBg = 'bg-amber-50 hover:bg-amber-100';
                    borderStyle = 'border border-amber-300 border-dashed';
                    textColor = 'text-amber-900 font-bold';
                  }

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => handleDayClick(cell.dateStr)}
                      className={`min-h-[58px] p-1.5 rounded-lg text-left transition-all relative flex flex-col justify-between ${cellBg} ${borderStyle}`}
                      title={
                        cell.holidayName
                          ? `${cell.dateStr}: ${cell.holidayName}`
                          : cell.dateStr
                      }
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs tabular-nums ${textColor}`}>
                          {cell.dayNumber}
                        </span>
                        {cell.isHoliday && (
                          <span className="text-[9px] px-1 py-0.2 bg-red-100 text-red-700 font-bold rounded">
                            Праздник
                          </span>
                        )}
                      </div>

                      {/* Day Markers */}
                      <div className="flex flex-col gap-0.5 mt-1">
                        {summary.myStatus === 'approved' && (
                          <span className="text-[9px] text-[#007A60] font-bold truncate">
                            Отпуск
                          </span>
                        )}
                        {summary.myStatus === 'approved_exception' && (
                          <span className="text-[9px] text-[#007A60] font-bold truncate">
                            Исключение
                          </span>
                        )}
                        {summary.myStatus === 'submitted' && (
                          <span className="text-[9px] text-amber-800 font-semibold truncate">
                            На рассм.
                          </span>
                        )}
                        {isSelected && !summary.myStatus && (
                          <span className="text-[9px] text-[#007A60] font-bold truncate">
                            Выбрано
                          </span>
                        )}
                        {/* Anonymized colleague indicator without names */}
                        {summary.hasColleagueConfirmedAbsence && (
                          <span className="text-[9px] text-slate-500 truncate">
                            Занято ({summary.colleagueConfirmedCount})
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Calendar Legend */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#DCF5ED] border border-[#00A882]" />
              <span>Выбранные даты</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#E3F4EB] border border-[#00A882]" />
              <span>Мой согласованный отпуск</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300 border-dashed" />
              <span>На рассмотрении</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#ECECEC] border border-slate-300" />
              <span>Праздник (ст. 151)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Request Form & Validation Engine (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#34495E] flex items-center gap-2">
              <span>{editingPreferenceId ? 'Корректировка пожелания' : 'Запланировать отпуск'}</span>
            </h2>
            <button
              type="button"
              onClick={setDemoDatesAug}
              className="text-xs font-semibold text-[#007A60] hover:text-[#00634E] hover:underline flex items-center gap-1 cursor-pointer"
              title="Заполнить 23–29 августа для быстрого показа сценария"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>23–29 авг (Демо)</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Dates row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Начало периода
                </label>
                <input
                  type="date"
                  value={startDate}
                  min="2027-01-01"
                  max="2027-12-31"
                  onChange={(e) => handleDateChange(e.target.value, endDate)}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-[#00A882] focus:border-[#00A882]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Окончание периода
                </label>
                <input
                  type="date"
                  value={endDate}
                  min="2027-01-01"
                  max="2027-12-31"
                  onChange={(e) => handleDateChange(startDate, e.target.value)}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-[#00A882] focus:border-[#00A882]"
                  required
                />
              </div>
            </div>

            {/* Replacement employee selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-[#007A60]" />
                <span>Замещающий сотрудник</span>
              </label>
              <select
                value={replacementId}
                onChange={(e) => {
                  setReplacementId(e.target.value);
                  setAcknowledged(false);
                }}
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-[#00A882] focus:border-[#00A882]"
                required
              >
                <option value="">-- Выберите замещающего --</option>
                {replacementCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.positionName} ({c.departmentName})
                  </option>
                ))}
              </select>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Комментарий к пожеланию (необязательно)
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: семейная поездка, передал дела коллегам"
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-[#00A882] focus:border-[#00A882]"
              />
            </div>

            {/* Real-time Calculation Breakdown Cards */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-[#F6F8F7] rounded-lg border border-[#D7DFDC] text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Календарные дни</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">
                  {validation.absenceDays} дн.
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Трудовой отпуск (ст. 151)</span>
                <span className="font-bold text-[#007A60] text-sm tabular-nums">
                  {validation.leaveDays} дн.
                </span>
                {validation.holidayDates.length > 0 && (
                  <span className="text-[10px] text-red-600 block">
                    (без {validation.holidayDates.length} праздников)
                  </span>
                )}
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 block text-[11px]">Летний расход (01.06–31.08)</span>
                <span
                  className={`font-bold text-sm tabular-nums ${
                    validation.summerExcess > 0 ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {validation.summerDays} из {validation.summerLimit} дн.
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 block text-[11px]">Баланс рабочего года</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">
                  {validation.workYearUsedAndPlanned} / {validation.workYearEntitlement} дн.
                </span>
                <span className="text-[10px] text-slate-500 block">
                  (остаток {validation.workYearRemaining} дн.)
                </span>
              </div>
            </div>

            {/* Validation Feedback Messages */}
            <div className="space-y-2">
              {validation.results.map((res, idx) => {
                let boxClass = 'bg-slate-50 border-slate-200 text-slate-700';
                let Icon = Info;

                if (res.kind === 'input_error') {
                  boxClass = 'bg-[#FDEBED] border-[#A52A36]/30 text-[#A52A36]';
                  Icon = XCircle;
                } else if (res.kind === 'corporate_conflict') {
                  boxClass = 'bg-[#FFF3D6] border-[#805300]/30 text-[#805300]';
                  Icon = AlertTriangle;
                } else if (res.kind === 'legal_block') {
                  boxClass = 'bg-[#FDEBED] border-[#A52A36]/30 text-[#A52A36]';
                  Icon = XCircle;
                } else if (res.kind === 'legal_review') {
                  boxClass = 'bg-[#FFF3D6] border-[#805300]/30 text-[#805300]';
                  Icon = HelpCircle;
                } else if (res.kind === 'warning') {
                  boxClass = 'bg-blue-50 border-blue-200 text-blue-800';
                  Icon = Info;
                }

                // In employee view, sanitize message so NO colleague names are revealed!
                let displayMsg = res.message;
                if (res.code.startsWith('CORP-02') || res.code.startsWith('CORP-03') || res.code.startsWith('CORP-04') || res.code.startsWith('CORP-05')) {
                  displayMsg = 'Недопустимо одновременное отсутствие по должности (внутреннее правило оргструктуры). Требуется согласование руководителя или HR.';
                }

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-xs leading-relaxed flex items-start gap-2 ${boxClass}`}
                  >
                    <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p>{displayMsg}</p>
                      {res.sourceRef && (
                        <p className="text-[10px] opacity-75 mt-0.5">{res.sourceRef}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {validation.results.length === 0 && (
                <div className="p-2.5 rounded-lg border border-[#00A882]/30 bg-[#DCF5ED]/40 text-[#116149] text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00A882]" />
                  <span>Реализованные проверки пройдены: ограничений не выявлено.</span>
                </div>
              )}
            </div>

            {/* Mandatory Employee Checkbox for Conflicts/Obstacles */}
            {validation.requiresAcknowledgement && (
              <div className="p-3 rounded-lg border-2 border-amber-300 bg-amber-50/70 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-[#007A60] focus:ring-[#00A882]"
                  />
                  <span className="text-xs font-semibold text-amber-950 leading-snug">
                    Я понимаю указанные конфликты. Эти даты требуют отдельного рассмотрения HR или
                    руководителем; отправка не означает согласования отпуска.
                  </span>
                </label>
              </div>
            )}

            {/* Form Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="flex-1 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>В черновик</span>
              </button>

              <button
                type="submit"
                disabled={validation.hasInputErrors || (validation.requiresAcknowledgement && !acknowledged)}
                className="flex-2 py-2 px-4 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{editingPreferenceId ? 'Сохранить и отправить' : 'Отправить на рассмотрение'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Section: Employee's Own Requests in Horizon */}
      <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#34495E]">
            Мой график и пожелания на {horizon === 'H1' ? 'I полугодие' : horizon === 'H2' ? 'II полугодие' : 'весь 2027 год'}
          </h2>
          <span className="text-xs text-slate-500">
            Всего записей: {ownItems.length}
          </span>
        </div>

        {ownItems.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            В выбранном периоде пока нет запланированных отпусков или поданных пожеланий.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-semibold">Период отпуска</th>
                  <th className="py-2.5 px-3 font-semibold">Длительность</th>
                  <th className="py-2.5 px-3 font-semibold">Статус</th>
                  <th className="py-2.5 px-3 font-semibold">Комментарий / Ответ HR</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ownItems.map((item) => {
                  let statusBadge = null;

                  if (item.status === 'approved') {
                    statusBadge = (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-[#116149] bg-[#DCF5ED] px-2 py-0.5 rounded text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          Согласовано в плане
                        </span>
                        {item.isException && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                            Исключение
                          </span>
                        )}
                      </div>
                    );
                  } else if (item.status === 'submitted') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                        <Clock className="w-3 h-3" />
                        На рассмотрении
                      </span>
                    );
                  } else if (item.status === 'returned') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-200 px-2 py-0.5 rounded text-[11px]">
                        <RotateCcw className="w-3 h-3" />
                        На корректировке
                      </span>
                    );
                  } else if (item.status === 'rejected') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded text-[11px]">
                        <XCircle className="w-3 h-3" />
                        Отклонено
                      </span>
                    );
                  } else if (item.status === 'draft') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        Черновик
                      </span>
                    );
                  } else if (item.status === 'withdrawn') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded text-[11px]">
                        Отозвано
                      </span>
                    );
                  }

                  const datesCalc = getDateRangeArray(item.startDate, item.endDate);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        {formatDateRangeRu(item.startDate, item.endDate)}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-600 whitespace-nowrap">
                        {datesCalc.length} календ. дн.
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{statusBadge}</td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs">
                        {item.returnReason && (
                          <div className="text-amber-800 font-medium">
                            Возврат: {item.returnReason}
                          </div>
                        )}
                        {item.rejectionReason && (
                          <div className="text-red-700 font-medium">
                            Причина отказа: {item.rejectionReason}
                          </div>
                        )}
                        {item.comment && !item.returnReason && !item.rejectionReason && (
                          <span className="text-slate-500">{item.comment}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {item.prefRef && item.status === 'submitted' && (
                          <button
                            type="button"
                            onClick={() => handleWithdraw(item.prefRef!.id)}
                            className="text-xs text-slate-600 hover:text-red-700 font-medium transition-colors"
                          >
                            Отозвать
                          </button>
                        )}
                        {item.prefRef && (item.status === 'draft' || item.status === 'returned') && (
                          <button
                            type="button"
                            onClick={() => handleEditPreference(item.prefRef!)}
                            className="text-xs text-[#007A60] hover:text-[#00634E] font-semibold transition-colors"
                          >
                            Редактировать
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
