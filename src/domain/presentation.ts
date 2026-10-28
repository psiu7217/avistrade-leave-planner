import type {
  AbsenceType,
  CorporateRule,
  PreferenceStatus,
  ValidationResultKind,
} from "./types";

// Business-facing labels. Internal action codes are intentionally kept in state
// for compatibility with existing saved demo data and the workflow reducer.
const AUDIT_ACTION_LABELS: Record<string, string> = {
  SYSTEM_BOOT: "Подготовлен график отпусков",
  SAVE_DRAFT: "Сохранён черновик",
  SUBMIT_PREFERENCE: "Пожелание отправлено",
  WITHDRAW_PREFERENCE: "Пожелание отозвано",
  APPROVE_PREFERENCE: "Отпуск согласован",
  APPROVE_EXCEPTION: "Согласовано с исключением",
  RETURN_PREFERENCE: "Возвращено на корректировку",
  REJECT_PREFERENCE: "Пожелание отклонено",
  UPDATE_RULE: "Изменено правило компании",
  UPDATE_CONTRACT: "Уточнён срок контракта",
  RESET_STATE: "Восстановлены исходные данные",
};

const PREFERENCE_STATUS_LABELS: Record<PreferenceStatus, string> = {
  draft: "Черновик",
  submitted: "На рассмотрении",
  returned: "Нужно исправить",
  approved: "Согласовано в плане",
  rejected: "Отклонено",
  withdrawn: "Отозвано",
};

const VALIDATION_KIND_LABELS: Record<ValidationResultKind, string> = {
  input_error: "Нужно исправить",
  warning: "Обратите внимание",
  corporate_conflict: "Ограничение компании",
  legal_block: "Требование законодательства",
  legal_review: "Нужна проверка HR",
  config_review: "Требуется уточнение правила",
};

const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  labor: "Трудовой отпуск",
  unpaid: "Отпуск без сохранения зарплаты",
  other: "Другое отсутствие",
};

export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? "Другое действие с графиком отпусков";
}

export function getPreferenceStatusLabel(status: PreferenceStatus): string {
  return PREFERENCE_STATUS_LABELS[status];
}

export function getValidationKindLabel(kind: ValidationResultKind): string {
  return VALIDATION_KIND_LABELS[kind];
}

export function getAbsenceTypeLabel(type: AbsenceType): string {
  return ABSENCE_TYPE_LABELS[type];
}

export function getCorporateRuleName(rule: CorporateRule): string {
  if (rule.code === "salesMaxConcurrent") {
    return "Лимит одновременных отпусков отдела продаж";
  }
  if (rule.code === "summerMaxDays") return "Лимит летнего отпуска";
  if (rule.code === "noticeMonths") return "Срок подачи пожелания";
  return rule.name;
}

export function formatAuditTimestampRu(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Handles both new messages and descriptions already saved in localStorage.
export function readableText(value: string): string {
  return value
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year, month, day) => 
      `${day}.${month}.${year}`)
    .replace(/\s*\(версия v\d+\)/gi, "");
}
