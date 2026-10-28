/**
 * HR Workspace Screen («Кабинет HR / Согласование отпусков»)
 * Conforms to Sections 4.2, 5, 6, 8, 9, 10.4 of the Technical Specification.
 */

import React, { useState, useMemo, useEffect } from "react";
import { useApp } from "../store/AppContext";
import {
  areIntervalsOverlapping,
  compareDateStr,
  formatDateRangeRu,
  formatDateRu,
  getDateRangeArray,
  MONTH_NAMES_RU,
  pad2,
  WEEKDAYS_SHORT_RU,
} from "../domain/dates";
import {
  getMonthCalendarGrid,
  getMonthsForHorizon,
  getHorizonDateRange,
} from "../domain/calendarProjection";
import {
  validatePreference,
  validationFingerprint,
  changedApprovalConflicts,
} from "../domain/validatePreference";
import { CorporateRule, Employee, Horizon, Preference } from "../domain/types";
import {
  getAuditActionLabel,
  getCorporateRuleName,
  getAbsenceTypeLabel,
  getPreferenceStatusLabel,
  getValidationKindLabel,
  formatAuditTimestampRu,
  readableText,
} from "../domain/presentation";
import { useDialogFocus } from "../components/useDialogFocus";
import { HRControlPanel } from "../components/HRControlPanel";
import { HRBalancesPanel } from "../components/HRBalancesPanel";
import { HRTab } from "../domain/types";
import { describeCoverageRisk, getCoverageRisks } from "../domain/hrInsights";
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
  UserCheck,
  Filter,
  Download,
} from "lucide-react";

export function HRPage({
  activeTab,
  setActiveTab,
}: {
  activeTab: HRTab;
  setActiveTab: (tab: HRTab) => void;
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
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [queueFilter, setQueueFilter] = useState<
    "all" | "submitted" | "conflict" | "approved"
  >("submitted");

  // Active Review Drawer / Modal
  const [reviewPreference, setReviewPreference] = useState<Preference | null>(
    null,
  );
  const [exceptionReason, setExceptionReason] = useState<string>("");
  const [unpaidBasis, setUnpaidBasis] = useState("");
  useEffect(
    () => setUnpaidBasis(reviewPreference?.unpaidApprovalBasis ?? ""),
    [reviewPreference?.id],
  );
  const [returnReason, setReturnReason] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [actionModalType, setActionModalType] = useState<
    "exception" | "return" | "reject" | null
  >(null);

  // Rule editing modal
  const [editingRule, setEditingRule] = useState<CorporateRule | null>(null);
  const [newRuleValue, setNewRuleValue] = useState<number>(0);
  const [ruleChangeReason, setRuleChangeReason] = useState<string>("");

  // P1: Create request on behalf of employee
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createEmployeeId, setCreateEmployeeId] = useState<string>(
    state.employees[0].id,
  );
  const [createStartDate, setCreateStartDate] = useState<string>("2027-08-02");
  const [createEndDate, setCreateEndDate] = useState<string>("2027-08-15");
  const [createReplacementId, setCreateReplacementId] = useState<string>(
    state.employees[1].id,
  );
  const [createComment, setCreateComment] = useState<string>(
    "Создано специалистом HR",
  );
  const [createLeaveType, setCreateLeaveType] = useState<"labor" | "unpaid">(
    "labor",
  );
  const [createUnpaidReason, setCreateUnpaidReason] = useState<
    "personal" | "study"
  >("personal");
  useDialogFocus(
    actionModalType ||
      (reviewPreference
        ? "review"
        : editingRule
          ? "rule"
          : showCreateModal
            ? "create"
            : false),
    () => {
      if (actionModalType) setActionModalType(null);
      else if (reviewPreference) setReviewPreference(null);
      else if (editingRule) setEditingRule(null);
      else setShowCreateModal(false);
    },
  );

  const horizonMonths = useMemo(() => getMonthsForHorizon(horizon), [horizon]);
  // Review checks the whole request, independently of the visible calendar horizon.
  const coverageRisks = useMemo(
    () => getCoverageRisks(state, calendarYear, "ALL"),
    [state, calendarYear],
  );
  const reviewCoverageRisks = reviewPreference
    ? coverageRisks.filter((r) => r.requestIds.includes(reviewPreference.id))
    : [];

  // Filtered employees for calendar
  const filteredEmployees = useMemo(() => {
    if (selectedDepartment === "all") return state.employees;
    return state.employees.filter((e) => e.departmentId === selectedDepartment);
  }, [state.employees, selectedDepartment]);

  // Validation for currently reviewed preference
  const reviewValidation = useMemo(() => {
    if (!reviewPreference) return null;
    return validatePreference(
      reviewPreference,
      state,
      state.demoDate,
      reviewPreference.id,
    );
  }, [reviewPreference, state]);

  // All preferences in queue
  const queuePreferences = useMemo(() => {
    const range = getHorizonDateRange(calendarYear, horizon);
    const list = state.preferences
      .filter(
        (p) =>
          p.status !== "draft" &&
          areIntervalsOverlapping(
            p.startDate,
            p.endDate,
            range.start,
            range.end,
          ) &&
          (selectedDepartment === "all" ||
            state.employees.find((e) => e.id === p.employeeId)?.departmentId ===
              selectedDepartment),
      )
      .map((p) => {
        const emp = state.employees.find((e) => e.id === p.employeeId);
        const val = validatePreference(p, state, state.demoDate, p.id);
        return {
          preference: p,
          employee: emp,
          validation: val,
        };
      });

    if (queueFilter === "submitted") {
      return list.filter((item) => item.preference.status === "submitted");
    } else if (queueFilter === "conflict") {
      return list.filter((item) =>
        item.validation.results.some((r) =>
          [
            "corporate_conflict",
            "legal_block",
            "legal_review",
            "config_review",
          ].includes(r.kind),
        ),
      );
    } else if (queueFilter === "approved") {
      return list.filter((item) => item.preference.status === "approved");
    }
    return list;
  }, [state, queueFilter, horizon, calendarYear, selectedDepartment]);

  const reviewablePeriods: Preference[] = [
    ...state.preferences,
    ...state.existingAbsences
      .filter((a) => a.type === "labor")
      .map((a) => ({
        id: a.id,
        employeeId: a.employeeId,
        startDate: a.startDate,
        endDate: a.endDate,
        replacementEmployeeId:
          state.employees.find((e) => e.active && e.id !== a.employeeId)?.id ??
          "",
        comment: a.note ?? "",
        status: "approved" as const,
        revision: 1,
        createdAt: "",
        updatedAt: "",
        submittedOn: state.demoDate,
        approvedRuleVersions: {
          salesMaxConcurrent: 1,
          summerMaxDays: 1,
          noticeMonths: 1,
        },
      })),
  ];
  const ruleImpact = useMemo(() => {
    if (!editingRule) return { open: 0, approved: 0 };
    const next = {
      ...state,
      corporateRules: {
        ...state.corporateRules,
        [editingRule.code]: { ...editingRule, value: newRuleValue },
      },
    };
    let open = 0,
      approved = 0;
    if (!Number.isInteger(newRuleValue)) return { open, approved };
    for (const p of reviewablePeriods.filter((p) =>
      ["approved", "submitted"].includes(p.status),
    )) {
      const before = validatePreference(p, state, state.demoDate, p.id).results;
      const after = validatePreference(p, next, state.demoDate, p.id).results;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        if (p.status === "approved") approved++;
        else open++;
      }
    }
    return { open, approved };
  }, [state, editingRule, newRuleValue]);

  const changedApproved = reviewablePeriods.filter(
    (p) => changedApprovalConflicts(p, state).length > 0,
  );

  // Handle normal approval
  const handleApproveNormally = (pref: Preference) => {
    try {
      dispatch({
        type: "APPROVE_PREFERENCE",
        payload: { preferenceId: pref.id, unpaidApprovalBasis: unpaidBasis },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification(
        "success",
        "Пожелание успешно согласовано в рабочем плане.",
      );
      setReviewPreference(null);
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка согласования");
    }
  };

  // Handle exception approval
  const handleApproveExceptionSubmit = () => {
    if (!reviewPreference) return;
    if ((exceptionReason || "").trim().length < 10) {
      showNotification(
        "error",
        "Основание для корпоративного исключения должно содержать не менее 10 символов.",
      );
      return;
    }

    try {
      dispatch({
        type: "APPROVE_EXCEPTION",
        payload: {
          preferenceId: reviewPreference.id,
          reason: exceptionReason.trim(),
          unpaidApprovalBasis: unpaidBasis,
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification(
        "success",
        "Корпоративное исключение успешно согласовано с сохранением основания в истории решений.",
      );
      setActionModalType(null);
      setReviewPreference(null);
      setExceptionReason("");
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка исключения");
    }
  };

  // Handle return for correction
  const handleReturnSubmit = () => {
    if (!reviewPreference) return;
    if (!(returnReason || "").trim()) {
      showNotification("error", "Укажите причину возврата на корректировку.");
      return;
    }

    try {
      dispatch({
        type: "RETURN_PREFERENCE",
        payload: {
          preferenceId: reviewPreference.id,
          reason: returnReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification(
        "info",
        "Пожелание возвращено сотруднику на корректировку.",
      );
      setActionModalType(null);
      setReviewPreference(null);
      setReturnReason("");
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка");
    }
  };

  // Handle rejection
  const handleRejectSubmit = () => {
    if (!reviewPreference) return;
    if (!(rejectionReason || "").trim()) {
      showNotification("error", "Укажите причину отклонения.");
      return;
    }

    try {
      dispatch({
        type: "REJECT_PREFERENCE",
        payload: {
          preferenceId: reviewPreference.id,
          reason: rejectionReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification("info", "Пожелание отклонено.");
      setActionModalType(null);
      setReviewPreference(null);
      setRejectionReason("");
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка");
    }
  };

  // Rule edit modal submission
  const handleRuleSave = () => {
    if (!editingRule) return;
    if ((ruleChangeReason || "").trim().length < 10) {
      showNotification(
        "error",
        "Основание для изменения правила должно содержать не менее 10 символов.",
      );
      return;
    }

    try {
      dispatch({
        type: "UPDATE_RULE",
        payload: {
          code: editingRule.code,
          newValue: Number(newRuleValue),
          reason: ruleChangeReason.trim(),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification(
        "success",
        `Правило «${getCorporateRuleName(editingRule)}» обновлено. График пересчитан.`,
      );
      setEditingRule(null);
      setRuleChangeReason("");
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка обновления правила");
    }
  };

  // P1: Create request on behalf of employee submit
  const handleCreateOnBehalf = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const candidate = {
        leaveType: createLeaveType,
        unpaidReason: createUnpaidReason,
        employeeId: createEmployeeId,
        startDate: createStartDate,
        endDate: createEndDate,
        replacementEmployeeId: createReplacementId,
        comment: createComment,
        submittedOn: state.demoDate,
      };
      const validation = validatePreference(candidate, state);
      dispatch({
        type: "SUBMIT_PREFERENCE",
        payload: {
          leaveType: createLeaveType,
          unpaidReason: createUnpaidReason,
          employeeId: createEmployeeId,
          startDate: createStartDate,
          endDate: createEndDate,
          replacementEmployeeId: createReplacementId,
          comment: createComment,
          acknowledgedCodes: validation.results.map((r) => r.code),
          acknowledgedFingerprint: validationFingerprint(validation, state),
        },
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      showNotification(
        "success",
        "Пожелание успешно создано от имени сотрудника и добавлено в очередь.",
      );
      setShowCreateModal(false);
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка создания");
    }
  };

  // P1: Export CSV handler
  const handleExportCSV = () => {
    const rows = [
      [
        "№",
        "Сотрудник",
        "Должность",
        "Отдел",
        "Начало",
        "Окончание",
        "Календарных дней",
        "Статус",
        "Тип",
      ],
    ];

    // Approved preferences
    state.preferences
      .filter((p) => p.status === "approved")
      .forEach((p) => {
        const emp = state.employees.find((e) => e.id === p.employeeId);
        const days = getDateRangeArray(p.startDate, p.endDate).length;
        rows.push([
          String(rows.length),
          emp ? emp.name : p.employeeId,
          emp ? emp.positionName : "",
          emp ? emp.departmentName : "",
          p.startDate,
          p.endDate,
          String(days),
          "Согласовано в плане",
          `${p.leaveType === "unpaid" ? "Без сохранения зарплаты" : "Трудовой отпуск"}${p.isException ? " · Корпоративное исключение" : ""}`,
        ]);
      });

    // Existing absences
    state.existingAbsences.forEach((a) => {
      const emp = state.employees.find((e) => e.id === a.employeeId);
      const days = getDateRangeArray(a.startDate, a.endDate).length;
      rows.push([
        String(rows.length),
        emp ? emp.name : a.employeeId,
        emp ? emp.positionName : "",
        emp ? emp.departmentName : "",
        a.startDate,
        a.endDate,
        String(days),
        "Подтвержденное отсутствие",
        a.note || getAbsenceTypeLabel(a.type),
      ]);
    });

    const csvContent =
      "\uFEFF" +
      rows
        .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
        .join("\n");

    const encodedUri = URL.createObjectURL(
      new Blob([csvContent], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Avistrade_LeaveFlow_Plan_2027_${Date.now()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(encodedUri), 1000);
    showNotification(
      "info",
      "Экспорт выгружен. Напоминание: файл является рабочим планом и не является официальным кадровым документом.",
    );
  };

  // Month days for calendar table
  const daysInMonth = useMemo(() => {
    const total = new Date(
      Date.UTC(calendarYear, calendarMonth, 0),
    ).getUTCDate();
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
            Ответственный:{" "}
            <span className="font-semibold text-slate-800">
              {currentUser.name}
            </span>{" "}
            (Ведущий HR-специалист)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 text-xs font-semibold text-[#007A60] bg-[#DCF5ED] hover:bg-[#C9EFE2] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Подать за сотрудника</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Выгрузить рабочий план в формате CSV"
          >
            <Download className="w-4 h-4" />
            <span>Экспорт рабочего плана</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-3 items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === "calendar"
                ? "bg-[#007A60] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Календарь команды</span>
          </button>
          <button
            onClick={() => setActiveTab("queue")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === "queue"
                ? "bg-[#007A60] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Очередь пожеланий ({queuePreferences.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === "rules"
                ? "bg-[#007A60] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Корпоративные правила</span>
          </button>
          <button
            onClick={() => setActiveTab("control")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${activeTab === "control" ? "bg-[#007A60] text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Контроль плана</span>
          </button>
          <button
            onClick={() => setActiveTab("balances")}
            className={`px-4 py-2 text-xs font-bold rounded-lg ${activeTab === "balances" ? "bg-[#007A60] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Остатки и сроки
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === "audit"
                ? "bg-[#007A60] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <History className="w-4 h-4" />
            <span>История решений ({state.auditEvents.length})</span>
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

      {changedApproved.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <strong>Требуют внимания после изменения правил:</strong>{" "}
          {changedApproved
            .map(
              (p) =>
                `${state.employees.find((e) => e.id === p.employeeId)?.name}: ${formatDateRangeRu(p.startDate, p.endDate)}`,
            )
            .join("; ")}
          . Периоды сохранены; прежнее исключение не разрешает новые нарушения
          автоматически.
        </div>
      )}

      {activeTab === "queue" && (
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          Подразделение очереди
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
          >
            <option value="all">Все подразделения</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* TAB 1: TEAM CALENDAR */}
      {activeTab === "balances" && <HRBalancesPanel />}
      {activeTab === "control" && (
        <HRControlPanel
          onOpenPreference={(id) => {
            const p = state.preferences.find((p) => p.id === id);
            if (p) setReviewPreference(p);
          }}
        />
      )}
      {activeTab === "calendar" && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  aria-label="Предыдущий месяц"
                  onClick={() => setCalendarMonth(calendarMonth - 1)}
                  disabled={calendarMonth <= horizonMonths[0]}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-[#34495E] min-w-[130px] text-center">
                  {MONTH_NAMES_RU[calendarMonth - 1]} {calendarYear}
                </span>
                <button
                  aria-label="Следующий месяц"
                  onClick={() => setCalendarMonth(calendarMonth + 1)}
                  disabled={
                    calendarMonth >= horizonMonths[horizonMonths.length - 1]
                  }
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
                  <option value="all">
                    Все отделы ({state.employees.length} сотр.)
                  </option>
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
                <span className="w-3 h-3 rounded bg-[#007A60]" />
                <span>Согласован</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-400" />
                <span>Ожидает HR</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#34495E] ring-2 ring-amber-400" />
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
                        d.isWeekend
                          ? "bg-slate-100 text-slate-500"
                          : "text-slate-700"
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
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                        <div className="font-bold text-[#34495E]">
                          {emp.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[170px]">
                          {emp.positionCode} · {emp.departmentName}
                        </div>
                      </td>

                      {daysInMonth.map((d) => {
                        // Check if employee has confirmed leave or preference on date d
                        const confirmedLeave = state.existingAbsences.find(
                          (a) =>
                            a.employeeId === emp.id &&
                            areIntervalsOverlapping(
                              a.startDate,
                              a.endDate,
                              d.dateStr,
                              d.dateStr,
                            ),
                        );
                        const preference = state.preferences.find(
                          (p) =>
                            p.employeeId === emp.id &&
                            p.status !== "withdrawn" &&
                            p.status !== "rejected" &&
                            areIntervalsOverlapping(
                              p.startDate,
                              p.endDate,
                              d.dateStr,
                              d.dateStr,
                            ),
                        );

                        let cellClass = d.isWeekend
                          ? "bg-slate-50"
                          : "bg-white";
                        let cellContent = null;
                        let cellClick = undefined;

                        if (confirmedLeave) {
                          cellClass =
                            "bg-[#007A60] hover:bg-[#00634E] text-white";
                          cellContent = (
                            <span className="text-[9px] font-bold">
                              {confirmedLeave.type === "unpaid" ? "Б" : "О"}
                            </span>
                          );
                        } else if (preference) {
                          if (preference.status === "approved") {
                            cellClass = preference.isException
                              ? "bg-[#34495E] ring-2 ring-amber-400 text-white font-bold"
                              : "bg-[#007A60] text-white font-bold";
                            cellContent = (
                              <span className="text-[9px]">
                                {preference.leaveType === "unpaid" ? "Б" : "О"}
                              </span>
                            );
                            cellClick = () => setReviewPreference(preference);
                          } else if (preference.status === "submitted") {
                            cellClass =
                              "bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold cursor-pointer";
                            cellContent = <span className="text-[9px]">?</span>;
                            cellClick = () => setReviewPreference(preference);
                          }
                        }

                        return (
                          <td
                            key={d.dateStr}
                            className={`p-0 text-center border-r border-slate-200 h-9 transition-colors select-none ${cellClass}`}
                            title={`${emp.name}: ${d.dateStr} · ${confirmedLeave || preference?.status === "approved" ? "Согласовано" : preference?.status === "submitted" ? "На рассмотрении" : "Свободно"}`}
                          >
                            {cellClick ? (
                              <button
                                className="w-full h-full flex items-center justify-center"
                                onClick={cellClick}
                                aria-label={`${emp.name}, ${d.dateStr}, открыть пожелание`}
                              >
                                {cellContent}
                              </button>
                            ) : (
                              <span className="w-full h-full flex items-center justify-center">
                                {cellContent}
                              </span>
                            )}
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
      {activeTab === "queue" && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          {/* Filter Pills */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 bg-[#F6F8F7] p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setQueueFilter("submitted")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === "submitted"
                    ? "bg-[#007A60] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Ожидают решения (
                {
                  state.preferences.filter((p) => p.status === "submitted")
                    .length
                }
                )
              </button>
              <button
                onClick={() => setQueueFilter("conflict")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === "conflict"
                    ? "bg-[#007A60] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                С конфликтами
              </button>
              <button
                onClick={() => setQueueFilter("approved")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === "approved"
                    ? "bg-[#007A60] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Согласованные в плане
              </button>
              <button
                onClick={() => setQueueFilter("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  queueFilter === "all"
                    ? "bg-[#007A60] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
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
                    <th className="py-2.5 px-3 font-semibold">Период и дни</th>
                    <th className="py-2.5 px-3 font-semibold">
                      Выявленные проверки
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Статус</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Действие
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queuePreferences.map(
                    ({ preference, employee, validation }) => {
                      const empName = employee
                        ? employee.name
                        : preference.employeeId;
                      const posName = employee ? employee.positionName : "";

                      let statusBadge = null;
                      if (preference.status === "approved") {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#116149] bg-[#DCF5ED] px-2 py-0.5 rounded text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Согласовано
                            {preference.isException && " (исключение)"}
                          </span>
                        );
                      } else if (preference.status === "submitted") {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                            <Clock className="w-3 h-3" />
                            Ожидает HR
                          </span>
                        );
                      } else if (preference.status === "returned") {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-200 px-2 py-0.5 rounded text-[11px]">
                            На корректировке
                          </span>
                        );
                      } else if (preference.status === "rejected") {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded text-[11px]">
                            Отклонено
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="text-slate-400 font-medium">
                            {getPreferenceStatusLabel(preference.status)}
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={preference.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <div className="font-bold text-[#34495E]">
                              {empName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {posName}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-800">
                              {formatDateRangeRu(
                                preference.startDate,
                                preference.endDate,
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {preference.leaveType === "unpaid"
                                ? `${validation.absenceDays} календ. дн. · Без сохранения зарплаты`
                                : `${validation.absenceDays} календ. дн. (${validation.leaveDays} дн. трудового)`}
                            </div>
                          </td>
                          <td className="py-3 px-3 max-w-sm">
                            <div className="flex flex-col gap-1">
                              {validation.results.map((r, idx) => (
                                <div
                                  key={idx}
                                  className={`text-[11px] leading-tight flex items-start gap-1 ${
                                    r.kind === "corporate_conflict"
                                      ? "text-amber-800 font-medium"
                                      : r.kind === "legal_block"
                                        ? "text-red-700 font-bold"
                                        : r.kind === "legal_review"
                                          ? "text-amber-700"
                                          : "text-slate-600"
                                  }`}
                                >
                                  <span>•</span>
                                  <span>{readableText(r.message)}</span>
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
                          <td className="py-3 px-3 whitespace-nowrap">
                            {statusBadge}
                          </td>
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
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CORPORATE RULES MANAGEMENT */}
      {activeTab === "rules" && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#34495E]">
              Управление корпоративными правилами отпусков
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              HR управляет параметрами регламента ООО «Авистрейд». Изменение
              любого параметра требует обязательного основания (не менее 10
              символов), увеличивает версию правила и сохраняется в истории
              изменений. График автоматически пересчитывается.
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
                    <p className="text-xs font-bold text-[#007A60] mb-1">
                      Правило компании
                    </p>
                    <h3 className="text-sm font-bold text-[#34495E]">
                      {getCorporateRuleName(rule)}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-snug">
                      {rule.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        Текущее значение
                      </span>
                      <span className="text-xl font-bold text-slate-900 tabular-nums">
                        {rule.value}{" "}
                        {rule.code === "noticeMonths"
                          ? "мес."
                          : rule.code === "salesMaxConcurrent"
                            ? "чел."
                            : "дн."}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRule(rule);
                        setNewRuleValue(rule.value);
                        setRuleChangeReason("");
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
      {activeTab === "audit" && (
        <div className="bg-white rounded-xl p-5 border border-[#D7DFDC] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#34495E]">
              История действий и решений
            </h2>
            <span className="text-xs text-slate-500">
              Событий: {state.auditEvents.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-semibold">Дата и время</th>
                  <th className="py-2.5 px-3 font-semibold">Инициатор</th>
                  <th className="py-2.5 px-3 font-semibold">Действие</th>
                  <th className="py-2.5 px-3 font-semibold">Описание</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {state.auditEvents.map((evt) => (
                  <tr
                    key={evt.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">
                      {formatAuditTimestampRu(evt.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-sans font-semibold text-slate-800">
                      {evt.actorName}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                        {getAuditActionLabel(evt.action)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      {readableText(evt.summary)}
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Действие HR"
            className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-[#34495E]">
                  Рассмотрение пожелания на отпуск
                </h3>
                <p className="text-xs text-slate-500">
                  Сотрудник:{" "}
                  <span className="font-semibold text-slate-800">
                    {
                      state.employees.find(
                        (e) => e.id === reviewPreference.employeeId,
                      )?.name
                    }
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
                  {formatDateRangeRu(
                    reviewPreference.startDate,
                    reviewPreference.endDate,
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">
                  {reviewPreference.leaveType === "unpaid"
                    ? "Без сохранения зарплаты"
                    : "Трудовой отпуск"}
                </span>
                <span className="font-bold text-[#007A60] tabular-nums">
                  {reviewPreference.leaveType === "unpaid"
                    ? reviewValidation.absenceDays
                    : reviewValidation.leaveDays}{" "}
                  дн.
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">
                  Летний расход
                </span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {reviewPreference.leaveType === "unpaid"
                    ? "Не расходуется"
                    : `${reviewValidation.summerDays} из ${reviewValidation.summerLimit} дн.`}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">
                  Текущий статус
                </span>
                <span className="font-bold text-amber-900">
                  {
                    {
                      approved: "Согласовано в плане",
                      submitted: "На рассмотрении",
                      returned: "На корректировке",
                      rejected: "Отклонено",
                      withdrawn: "Отозвано",
                      draft: "Черновик",
                    }[reviewPreference.status]
                  }
                </span>
              </div>
            </div>

            {reviewPreference.leaveType === "unpaid" && (
              <section className="balance-note">
                <p>
                  <strong>Причина:</strong>{" "}
                  {reviewPreference.unpaidReason === "study"
                    ? "Учёба / сессия"
                    : "Личные / семейные обстоятельства"}
                </p>
                <p>{reviewPreference.comment}</p>
                <label>
                  Проверенное основание неоплачиваемого отпуска
                  <textarea
                    value={unpaidBasis}
                    readOnly={reviewPreference.status !== "submitted"}
                    onChange={(e) => setUnpaidBasis(e.target.value)}
                    placeholder="Проверенные документы, применимые гарантии, срок и основание без сохранения зарплаты"
                    rows={3}
                  />
                </label>
                <p>
                  Для согласования укажите не менее 10 символов. Для учёбы
                  проверьте, не положена ли оплата. Решение здесь относится к
                  плану; кадровое оформление выполняется отдельно.
                </p>
              </section>
            )}
            {/* Validation Findings for HR (names and exact days revealed!) */}
            {reviewCoverageRisks.length > 0 && (
              <section
                aria-label="Нагрузка на замещающего"
                className="rounded-lg border border-amber-400 bg-amber-50 p-4 space-y-2"
              >
                <h4 className="text-sm font-bold text-amber-950">
                  Проверьте замещение перед решением
                </h4>
                {reviewCoverageRisks.map((r) => (
                  <p
                    className="text-sm leading-relaxed text-amber-950"
                    key={r.id}
                  >
                    {describeCoverageRisk(r, state)}
                  </p>
                ))}
                <p className="text-xs text-amber-900">
                  Это сигнал нагрузки, а не новый запрет. Уточните объём работ и
                  согласие замещающего; ожидающие пожелания ещё не согласованы.
                </p>
              </section>
            )}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700">
                Результаты проверки по регламенту и ТК РБ:
              </h4>

              {reviewValidation.results.map((r, idx) => {
                let badge = "bg-slate-50 border-slate-200 text-slate-700";
                if (r.kind === "corporate_conflict")
                  badge = "bg-[#FFF3D6] border-amber-300 text-amber-900";
                if (r.kind === "legal_block")
                  badge = "bg-[#FDEBED] border-red-300 text-red-800";
                if (r.kind === "legal_review")
                  badge = "bg-amber-50 border-amber-300 text-amber-900";

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-xs leading-relaxed ${badge}`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>
                        {getValidationKindLabel(r.kind)}
                      </span>
                      {r.sourceRef && (
                        <span className="text-[10px] opacity-75">
                          {readableText(r.sourceRef)}
                        </span>
                      )}
                    </div>
                    <p>{readableText(r.message)}</p>
                    {!!r.affectedDates?.length && (
                      <p className="mt-1">
                        Даты:{" "}
                        {r.affectedDates.map((d) => formatDateRu(d)).join(", ")}
                      </p>
                    )}
                    {r.conflictingEmployeeIds &&
                      r.conflictingEmployeeIds.length > 0 && (
                        <div className="mt-1 text-[11px] font-semibold">
                          Конфликтующие сотрудники в графике:{" "}
                          {r.conflictingEmployeeIds
                            .map(
                              (id) =>
                                state.employees.find((e) => e.id === id)
                                  ?.name || id,
                            )
                            .join(", ")}
                        </div>
                      )}
                  </div>
                );
              })}

              {reviewValidation.results.length === 0 && (
                <div className="p-3 rounded-lg bg-[#DCF5ED] text-[#116149] text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#00A882]" />
                  <span>
                    Все проверки пройдены: ограничений не выявлено. Доступно
                    обычное согласование.
                  </span>
                </div>
              )}
            </div>

            {/* If employee confirmed conflict upon submission */}
            {reviewPreference.acknowledgement && (
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                ✓{" "}
                {reviewPreference.acknowledgement.confirmedBy &&
                reviewPreference.acknowledgement.confirmedBy !==
                  reviewPreference.employeeId
                  ? "HR подтвердил ограничения при создании от имени сотрудника"
                  : "Сотрудник подтвердил понимание ограничений при подаче"}

              </div>
            )}

            {/* Action Buttons */}
            {reviewPreference.status === "submitted" && (
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActionModalType("reject")}
                  className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  Отклонить
                </button>

                <button
                  type="button"
                  onClick={() => setActionModalType("return")}
                  className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                >
                  Вернуть на корректировку
                </button>

                {/* Corporate Exception Approval */}
                {reviewValidation.canApproveAsException && (
                  <button
                    type="button"
                    disabled={
                      reviewPreference.leaveType === "unpaid" &&
                      unpaidBasis.trim().length < 10
                    }
                    onClick={() => {
                      setActionModalType("exception");
                      setExceptionReason("");
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
                    disabled={
                      reviewPreference.leaveType === "unpaid" &&
                      unpaidBasis.trim().length < 10
                    }
                    onClick={() => handleApproveNormally(reviewPreference)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#007A60] hover:bg-[#00634E] rounded-lg transition-colors shadow-xs"
                  >
                    Согласовать в плане
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EXCEPTION APPROVAL REASON PROMPT */}
      {actionModalType === "exception" && reviewPreference && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Действие HR"
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="text-base font-bold text-[#34495E]">
              Основание корпоративного исключения
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              По регламенту ООО «Авистрейд» согласование исключения требует
              фиксации обоснованной производственной необходимости (не менее 10
              символов). Данные фиксируются в истории решений.
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
      {actionModalType === "return" && reviewPreference && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Действие HR"
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="text-base font-bold text-[#34495E]">
              Возврат пожелания на корректировку
            </h3>
            <p className="text-xs text-slate-600">
              Сотрудник увидит эту причину в личном плане и сможет
              скорректировать даты или замещающего.
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
      {actionModalType === "reject" && reviewPreference && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Действие HR"
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Действие HR"
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="text-base font-bold text-[#34495E]">
              Изменение правила «{getCorporateRuleName(editingRule)}»
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              После сохранения система автоматически пересчитает календарь
              и список пожеланий. Ранее принятые решения сохранятся.
            </p>
            <p className="text-sm text-slate-700">
              Изменение затрагивает: {ruleImpact.open} открытых пожеланий и{" "}
              {ruleImpact.approved} согласованных периодов. Согласованные
              периоды сохранятся.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Новое значение параметра
              </label>
              <input
                type="number"
                min={editingRule.code === "noticeMonths" ? 0 : 1}
                max={
                  editingRule.code === "summerMaxDays"
                    ? 92
                    : editingRule.code === "noticeMonths"
                      ? 6
                      : state.employees.filter(
                          (e) => e.active && e.positionCode === "MPP",
                        ).length
                }
                step={1}
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Действие HR"
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-bold text-[#34495E]">
              Подать пожелание от имени сотрудника
            </h3>
            <form onSubmit={handleCreateOnBehalf} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Вид отпуска
                <select
                  className="w-full border rounded-lg p-2"
                  value={createLeaveType}
                  onChange={(e) => {
                    setCreateLeaveType(e.target.value as "labor" | "unpaid");
                    if (e.target.value === "unpaid") setCreateComment("");
                  }}
                >
                  <option value="labor">Трудовой (оплачиваемый)</option>
                  <option value="unpaid">Без сохранения зарплаты</option>
                </select>
              </label>
              {createLeaveType === "unpaid" && (
                <label className="block text-xs font-semibold text-slate-700">
                  Причина запроса
                  <select
                    className="w-full border rounded-lg p-2"
                    value={createUnpaidReason}
                    onChange={(e) =>
                      setCreateUnpaidReason(
                        e.target.value as "personal" | "study",
                      )
                    }
                  >
                    <option value="personal">
                      Личные / семейные обстоятельства
                    </option>
                    <option value="study">Учёба / сессия</option>
                  </select>
                </label>
              )}
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
                      {e.name} — {e.positionName}
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
                  {createLeaveType === "unpaid"
                    ? "Основание запроса · обязательно"
                    : "Комментарий"}
                </label>
                <input
                  type="text"
                  value={createComment}
                  required={createLeaveType === "unpaid"}
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
