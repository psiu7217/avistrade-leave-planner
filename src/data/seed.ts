/**
 * Initial seed dataset for LeaveFlow v2.0 (Avistrade)
 * Conforms to Section 11.2 & Section 12 of the Technical Specification.
 */

import { AppState, Employee, Department, IncompatibilityPair, WorkYear, CorporateRule, ExistingAbsence, Preference } from '../domain/types';
import { buildShowcaseState } from './showcase';
export const DEMO_DATA_VERSION = 'showcase-2026-10-28-v1';

export const INITIAL_DEMO_DATE = '2026-10-28';
export const INITIAL_PLAN_YEAR = 2027;
export const STORAGE_KEY = 'leaveflow-demo-v2';

export const SEED_DEPARTMENTS: Department[] = [
  { id: 'dep-sales', name: 'Отдел продаж' },
  { id: 'dep-retail', name: 'Отдел розничных и секционных продаж' },
  { id: 'dep-branches', name: 'Управление региональных отделений' },
  { id: 'dep-exec', name: 'Дирекция компании' },
  { id: 'dep-logistics', name: 'Служба логистики и обеспечения' },
  { id: 'dep-hr', name: 'Служба по работе с персоналом' },
];

export const SEED_EMPLOYEES: Employee[] = [
  {
    id: 'emp-mpp-3', // Default employee for user demo
    contractEndDate: '2027-01-25', // Fictional deadline example, not a personnel fact.
    name: 'Иван Морозов',
    positionCode: 'MPP',
    positionName: 'Менеджер по продажам (МПП)',
    departmentId: 'dep-sales',
    departmentName: 'Отдел продаж',
    managerId: 'emp-no-1',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-mpp-1',
    name: 'Алексей Смирнов',
    positionCode: 'MPP',
    positionName: 'Менеджер по продажам (МПП)',
    departmentId: 'dep-sales',
    departmentName: 'Отдел продаж',
    managerId: 'emp-no-1',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-mpp-2',
    name: 'Дмитрий Ковалев',
    positionCode: 'MPP',
    positionName: 'Менеджер по продажам (МПП)',
    departmentId: 'dep-sales',
    departmentName: 'Отдел продаж',
    managerId: 'emp-no-1',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-mpp-4',
    name: 'Ольга Васильева',
    positionCode: 'MPP',
    positionName: 'Менеджер по продажам (МПП)',
    departmentId: 'dep-sales',
    departmentName: 'Отдел продаж',
    managerId: 'emp-no-1',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-sec-1',
    name: 'Елена Романова',
    positionCode: 'SECTION_MGR',
    positionName: 'Менеджер секции А',
    departmentId: 'dep-retail',
    departmentName: 'Отдел розничных и секционных продаж',
    managerId: 'emp-no-1',
    active: true,
    accessRoles: ['employee'],
    sectionGroupId: 'sec-grp-1',
    requiresLegalReview: false,
  },
  {
    id: 'emp-sec-2',
    name: 'Максим Кузнецов',
    positionCode: 'SECTION_MGR',
    positionName: 'Менеджер секции Б',
    departmentId: 'dep-retail',
    departmentName: 'Отдел розничных и секционных продаж',
    managerId: 'emp-no-1',
    active: true,
    accessRoles: ['employee'],
    sectionGroupId: 'sec-grp-1',
    requiresLegalReview: false,
  },
  {
    id: 'emp-no-1',
    name: 'Сергей Павлов',
    positionCode: 'NO',
    positionName: 'Начальник отдела продаж (НО)',
    departmentId: 'dep-sales',
    departmentName: 'Отдел продаж',
    managerId: 'emp-ro-1',
    active: true,
    accessRoles: ['employee'],
    sectionGroupId: 'sec-grp-1',
    branchGroupId: 'branch-grp-1',
    requiresLegalReview: false,
  },
  {
    id: 'emp-no-2',
    name: 'Андрей Белов',
    positionCode: 'NO',
    positionName: 'Начальник филиального отдела (НО)',
    departmentId: 'dep-branches',
    departmentName: 'Управление региональных отделений',
    managerId: 'emp-ro-2',
    active: true,
    accessRoles: ['employee'],
    branchGroupId: 'branch-grp-2',
    requiresLegalReview: false,
  },
  {
    id: 'emp-ro-1',
    name: 'Виктор Мельников',
    positionCode: 'RO',
    positionName: 'Руководитель отделения Север (РО)',
    departmentId: 'dep-branches',
    departmentName: 'Управление региональных отделений',
    managerId: 'emp-zav',
    active: true,
    accessRoles: ['employee'],
    branchGroupId: 'branch-grp-1',
    executiveGroupId: 'exec-grp-1',
    requiresLegalReview: false,
  },
  {
    id: 'emp-ro-2',
    name: 'Татьяна Федорова',
    positionCode: 'RO',
    positionName: 'Руководитель отделения Юг (РО)',
    departmentId: 'dep-branches',
    departmentName: 'Управление региональных отделений',
    managerId: 'emp-zav',
    active: true,
    accessRoles: ['employee'],
    branchGroupId: 'branch-grp-2',
    executiveGroupId: 'exec-grp-1',
    requiresLegalReview: false,
  },
  {
    id: 'emp-zav',
    name: 'Григорий Орлов',
    positionCode: 'ZAV',
    positionName: 'Зам. директора по адм. вопросам (ЗАВ)',
    departmentId: 'dep-exec',
    departmentName: 'Дирекция компании',
    managerId: 'emp-id',
    active: true,
    accessRoles: ['employee'],
    executiveGroupId: 'exec-grp-1',
    requiresLegalReview: false,
  },
  {
    id: 'emp-ztv',
    name: 'Николай Сидоров',
    positionCode: 'ZTV',
    positionName: 'Зам. директора по тех. вопросам (ЗТВ)',
    departmentId: 'dep-exec',
    departmentName: 'Дирекция компании',
    managerId: 'emp-id',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-id',
    name: 'Валерий Поляков',
    positionCode: 'ID',
    positionName: 'Исполнительный директор (ИД)',
    departmentId: 'dep-exec',
    departmentName: 'Дирекция компании',
    managerId: null,
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-hr',
    name: 'Наталья Соколова',
    positionCode: 'HR',
    positionName: 'Ведущий HR-специалист',
    departmentId: 'dep-hr',
    departmentName: 'Служба по работе с персоналом',
    managerId: 'emp-id',
    active: true,
    accessRoles: ['employee', 'hr'],
    requiresLegalReview: false,
  },
  {
    id: 'emp-legal-review',
    name: 'Анна Григорьева',
    positionCode: 'OTHER',
    positionName: 'Ведущий диспетчер логистики',
    departmentId: 'dep-logistics',
    departmentName: 'Служба логистики и обеспечения',
    managerId: 'emp-ztv',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: true, // Specific legal category test case
  },
  {
    id: 'emp-split-test',
    name: 'Денис Васильев',
    positionCode: 'OTHER',
    positionName: 'Специалист по закупкам',
    departmentId: 'dep-logistics',
    departmentName: 'Служба логистики и обеспечения',
    managerId: 'emp-ztv',
    active: true,
    accessRoles: ['employee'],
    requiresLegalReview: false,
  },
];

export const SEED_INCOMPATIBILITY_PAIRS: IncompatibilityPair[] = [
  // CORP-02: Section Managers & NO
  {
    employeeAId: 'emp-sec-1',
    employeeBId: 'emp-sec-2',
    ruleCode: 'CORP-02',
    scopeDescription: 'Менеджеры секций А и Б одного отдела не отсутствуют одновременно',
  },
  {
    employeeAId: 'emp-sec-1',
    employeeBId: 'emp-no-1',
    ruleCode: 'CORP-02',
    scopeDescription: 'Менеджер секции А и начальник отдела (НО) не отсутствуют одновременно',
  },
  {
    employeeAId: 'emp-sec-2',
    employeeBId: 'emp-no-1',
    ruleCode: 'CORP-02',
    scopeDescription: 'Менеджер секции Б и начальник отдела (НО) не отсутствуют одновременно',
  },
  // CORP-03: NO and RO of branch
  {
    employeeAId: 'emp-no-1',
    employeeBId: 'emp-ro-1',
    ruleCode: 'CORP-03',
    scopeDescription: 'НО отдела 1 и руководитель отделения 1 (РО) не отсутствуют одновременно',
  },
  {
    employeeAId: 'emp-no-2',
    employeeBId: 'emp-ro-2',
    ruleCode: 'CORP-03',
    scopeDescription: 'НО отдела 2 и руководитель отделения 2 (РО) не отсутствуют одновременно',
  },
  // CORP-04: RO and ZAV
  {
    employeeAId: 'emp-ro-1',
    employeeBId: 'emp-ro-2',
    ruleCode: 'CORP-04',
    scopeDescription: 'Руководители отделений (РО Север и РО Юг) не отсутствуют одновременно',
  },
  {
    employeeAId: 'emp-ro-1',
    employeeBId: 'emp-zav',
    ruleCode: 'CORP-04',
    scopeDescription: 'Руководитель отделения РО Север и ЗАВ не отсутствуют одновременно',
  },
  {
    employeeAId: 'emp-ro-2',
    employeeBId: 'emp-zav',
    ruleCode: 'CORP-04',
    scopeDescription: 'Руководитель отделения РО Юг и ЗАВ не отсутствуют одновременно',
  },
  // CORP-05: ZAV/ZTV and ID
  {
    employeeAId: 'emp-zav',
    employeeBId: 'emp-id',
    ruleCode: 'CORP-05',
    scopeDescription: 'ЗАВ и Исполнительный директор (ИД) не отсутствуют одновременно',
  },
  {
    employeeAId: 'emp-ztv',
    employeeBId: 'emp-id',
    ruleCode: 'CORP-05',
    scopeDescription: 'ЗТВ и Исполнительный директор (ИД) не отсутствуют одновременно',
  },
];

export const SEED_WORK_YEARS: WorkYear[] = [
  ...SEED_EMPLOYEES.map((emp) => ({
    id: `wy-${emp.id}-2027`,
    employeeId: emp.id,
    startDate: '2027-01-01',
    endDate: '2027-12-31',
    entitlementDays: 24,
    historyComplete: true,
    allowedParts: 2,
    partsBasisRef: 'ТК РБ ст. 174 (общее правило: не более 2 частей, одна не менее 14 дней)',
  })),
];

export const SEED_RULES: Record<string, CorporateRule> = {
  salesMaxConcurrent: {
    code: 'salesMaxConcurrent',
    name: 'Одновременный лимит МПП',
    description: 'Максимальное количество менеджеров по продажам (МПП) в подтвержденном отпуске одновременно',
    value: 2,
    version: 1,
    updatedAt: '2026-07-15T10:00:00Z',
    updatedBy: 'emp-hr',
  },
  summerMaxDays: {
    code: 'summerMaxDays',
    name: 'Летний максимум отпуска',
    description: 'Суммарный максимум дней трудового отпуска в летний период (01.06–31.08) за календарный год',
    value: 14,
    version: 1,
    updatedAt: '2026-07-15T10:00:00Z',
    updatedBy: 'emp-hr',
  },
  noticeMonths: {
    code: 'noticeMonths',
    name: 'Срок заблаговременности (мес.)',
    description: 'Минимальный срок заблаговременности подачи пожелания в календарных месяцах',
    value: 1,
    version: 1,
    updatedAt: '2026-07-15T10:00:00Z',
    updatedBy: 'emp-hr',
  },
};

export const SEED_EXISTING_ABSENCES: ExistingAbsence[] = [
  // 1 & 2: Two sales managers in approved absence 23-29 August 2027 (AT-03 scenario)
  {
    id: 'abs-mpp-1-aug',
    employeeId: 'emp-mpp-1',
    startDate: '2027-08-23',
    endDate: '2027-08-29',
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-mpp-1-2027',
    note: 'Согласованный летний период',
  },
  {
    id: 'abs-mpp-2-aug',
    employeeId: 'emp-mpp-2',
    startDate: '2027-08-23',
    endDate: '2027-08-29',
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-mpp-2-2027',
    note: 'Согласованный летний период',
  },
  // 3: Ivan Morozov has a 14-day confirmed leave in spring (March 15-28, 2027)
  // This satisfies LEGAL-02 (min 14 days part) so his Aug 23-29 proposal has no legal blocks!
  {
    id: 'abs-mpp-3-mar',
    employeeId: 'emp-mpp-3',
    startDate: '2027-03-15',
    endDate: '2027-03-28',
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-mpp-3-2027',
    note: 'Основная 14-дневная часть трудового отпуска',
  },
  // 4: Section manager Elena Romanova confirmed leave in July (July 5-18)
  {
    id: 'abs-sec-1-jul',
    employeeId: 'emp-sec-1',
    startDate: '2027-07-05',
    endDate: '2027-07-18',
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-sec-1-2027',
    note: 'Согласованный отпуск',
  },
  // 5: ZAV Grigory Orlov confirmed leave in Sept (Sept 6-19)
  {
    id: 'abs-zav-sep',
    employeeId: 'emp-zav',
    startDate: '2027-09-06',
    endDate: '2027-09-19',
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-zav-2027',
    note: 'Согласованный отпуск',
  },
  // 6: Special test employee for 12+12 legal block demo (Denis Vasiliev: first 12 days used)
  {
    id: 'abs-split-feb',
    employeeId: 'emp-split-test',
    startDate: '2027-02-01',
    endDate: '2027-02-12', // 12 leave days
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-split-test-2027',
    note: 'Первая часть 12 дней (без 14-дневного минимума)',
  },
  // 7: Employee with 10 days in June to test summerMaxDays (10 used + 7 candidate = 17 > 14)
  {
    id: 'abs-mpp-4-jun',
    employeeId: 'emp-mpp-4',
    startDate: '2027-06-07',
    endDate: '2027-06-16', // 10 leave days in summer
    type: 'labor',
    phase: 'confirmed',
    workYearId: 'wy-emp-mpp-4-2027',
    note: 'Использованная часть отпуска летом (10 дней)',
  },
];

export const SEED_PREFERENCES: Preference[] = [
  // 1. Open request from Andrey Belov (NO 2) in August
  {
    id: 'pref-open-1',
    employeeId: 'emp-no-2',
    startDate: '2027-08-02',
    endDate: '2027-08-15',
    replacementEmployeeId: 'emp-mpp-3',
    comment: 'Семейная поездка; для демонстрации нагрузки замещающим указан Иван Морозов',
    status: 'submitted',
    revision: 1,
    createdAt: '2026-10-25T09:30:00Z',
    updatedAt: '2026-10-25T09:30:00Z',
    submittedAt: '2026-10-25T09:30:00Z',
  },
  // 2. Open request from Olga Vasilyeva (MPP 4) with 7 days in August (testing 10 + 7 = 17 summer days!)
  {
    id: 'pref-open-summer-demo',
    employeeId: 'emp-mpp-4',
    startDate: '2027-08-09',
    endDate: '2027-08-15',
    replacementEmployeeId: 'emp-mpp-3',
    comment: 'Дополнительные дни в августе',
    status: 'submitted',
    revision: 1,
    createdAt: '2026-10-26T11:00:00Z',
    updatedAt: '2026-10-26T11:00:00Z',
    submittedAt: '2026-10-26T11:00:00Z',
  },
  // 3. Open request from Denis Vasiliev for remaining 12 days (12+12 illegal split demo for HR review)
  {
    id: 'pref-open-legal-block',
    employeeId: 'emp-split-test',
    startDate: '2027-09-06',
    endDate: '2027-09-17', // 12 leave days, completing 24 days without a 14-day portion
    replacementEmployeeId: 'emp-legal-review',
    comment: 'Оставшиеся 12 дней отпуска',
    status: 'submitted',
    revision: 1,
    createdAt: '2026-10-27T14:20:00Z',
    updatedAt: '2026-10-27T14:20:00Z',
    submittedAt: '2026-10-27T14:20:00Z',
    acknowledgement: {
      preferenceRevision: 1,
      confirmedAt: '2026-10-27T14:20:00Z',
      confirmedCodes: ['LEGAL-02'],
      rulesFingerprint: 'v1',
    },
  },
  // 4. Open request from Anna Grigoryeva (requiresLegalReview demo)
  {
    id: 'pref-open-legal-review',
    employeeId: 'emp-legal-review',
    startDate: '2027-08-16',
    endDate: '2027-08-29',
    replacementEmployeeId: 'emp-split-test',
    comment: 'Планируемый отпуск',
    status: 'submitted',
    revision: 1,
    createdAt: '2026-10-27T15:00:00Z',
    updatedAt: '2026-10-27T15:00:00Z',
    submittedAt: '2026-10-27T15:00:00Z',
  },
];

/** Small, stable fixture for isolated rule tests; not the presentation dataset. */
export const BASE_DEMO_STATE: AppState = {
  schemaVersion: '2.0.0',
  employees: SEED_EMPLOYEES,
  departments: SEED_DEPARTMENTS,
  incompatibilityPairs: SEED_INCOMPATIBILITY_PAIRS,
  preferences: SEED_PREFERENCES,
  existingAbsences: SEED_EXISTING_ABSENCES,
  workYears: SEED_WORK_YEARS,
  corporateRules: SEED_RULES,
  exceptions: [],
  auditEvents: [
    {
      id: 'audit-init-0',
      actorId: 'emp-hr',
      actorName: 'Наталья Соколова',
      action: 'SYSTEM_BOOT',
      entityId: 'system',
      summary: 'Инициализация кампании планирования отпусков на 2027 год по регламенту ООО «Авистрейд»',
      createdAt: '2026-10-28T07:00:00Z',
    },
  ],
  demoDate: INITIAL_DEMO_DATE,
  currentYear: INITIAL_PLAN_YEAR,
};

export const INITIAL_STATE: AppState = buildShowcaseState(BASE_DEMO_STATE, DEMO_DATA_VERSION);
