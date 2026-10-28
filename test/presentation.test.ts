import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAuditTimestampRu,
  getAbsenceTypeLabel,
  getAuditActionLabel,
  getCorporateRuleName,
  getPreferenceStatusLabel,
  getValidationKindLabel,
  readableText,
} from "../src/domain/presentation";

test("журнал показывает понятные названия всех действий", () => {
  const actions = [
    "SYSTEM_BOOT",
    "SAVE_DRAFT",
    "SUBMIT_PREFERENCE",
    "WITHDRAW_PREFERENCE",
    "APPROVE_PREFERENCE",
    "APPROVE_EXCEPTION",
    "RETURN_PREFERENCE",
    "REJECT_PREFERENCE",
    "UPDATE_RULE",
    "UPDATE_CONTRACT",
    "RESET_STATE",
  ];
  for (const action of actions) {
    const label = getAuditActionLabel(action);
    assert.notEqual(label, action);
    assert.match(label, /[А-Яа-яЁё]/);
  }
  assert.equal(getAuditActionLabel("REJECT_PREFERENCE"), "Пожелание отклонено");
  assert.equal(getAuditActionLabel("UNKNOWN_NEW_ACTION"), "Другое действие с графиком отпусков");
});

test("служебные названия статусов и проверок не попадают в интерфейс", () => {
  assert.equal(getPreferenceStatusLabel("withdrawn"), "Отозвано");
  assert.equal(getValidationKindLabel("corporate_conflict"), "Ограничение компании");
  assert.equal(getValidationKindLabel("legal_block"), "Требование законодательства");
  assert.equal(getAbsenceTypeLabel("unpaid"), "Отпуск без сохранения зарплаты");
});

test("названия настроек понятны без внутренних ключей", () => {
  assert.equal(
    getCorporateRuleName({
      code: "salesMaxConcurrent",
      name: "Одновременный лимит МПП",
      description: "",
      value: 2,
      version: 1,
      updatedAt: "",
      updatedBy: "",
    }),
    "Лимит одновременных отпусков отдела продаж",
  );
});

test("даты и ранее сохранённые записи отображаются по-русски", () => {
  assert.equal(
    readableText("Отпуск с 2027-08-23 по 2027-08-29 (версия v2)"),
    "Отпуск с 23.08.2027 по 29.08.2027",
  );
  assert.match(formatAuditTimestampRu("2026-10-28T07:00:00Z"), /28\.10\.2026/);
  assert.match(formatAuditTimestampRu("2026-10-28T07:00:00Z"), /10:00/);
  assert.equal(formatAuditTimestampRu("не дата"), "Дата не указана");
});
