/**
 * Domain types for LeaveFlow v2.0 (Avistrade)
 */

export type Role = 'employee' | 'hr';

export type PositionCode = 'MPP' | 'SECTION_MGR' | 'NO' | 'RO' | 'ZAV' | 'ZTV' | 'ID' | 'HR' | 'OTHER';

export interface Employee {
  id: string;
  name: string;
  positionCode: PositionCode;
  positionName: string;
  departmentId: string;
  departmentName: string;
  managerId: string | null;
  active: boolean;
  accessRoles: Role[];
  sectionGroupId?: string;
  branchGroupId?: string;
  executiveGroupId?: string;
  requiresLegalReview: boolean;
}

export interface Department {
  id: string;
  name: string;
  parentId?: string;
}

export interface IncompatibilityPair {
  employeeAId: string;
  employeeBId: string;
  ruleCode: string; // 'CORP-02' | 'CORP-03' | 'CORP-04' | 'CORP-05'
  scopeDescription: string;
}

export type PreferenceStatus =
  | 'draft'
  | 'submitted'
  | 'returned'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export interface AcknowledgementSnapshot {
  preferenceRevision: number;
  confirmedAt: string;
  confirmedCodes: string[];
  rulesFingerprint: string;
}

export interface Preference {
  id: string;
  employeeId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  replacementEmployeeId: string;
  comment: string;
  status: PreferenceStatus;
  revision: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  submittedAt?: string; // ISO
  acknowledgement?: AcknowledgementSnapshot;
  returnReason?: string;
  rejectionReason?: string;
  isException?: boolean;
  exceptionId?: string;
}

export type AbsenceType = 'labor' | 'unpaid' | 'other';
export type AbsencePhase = 'used' | 'confirmed';

export interface ExistingAbsence {
  id: string;
  employeeId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  type: AbsenceType;
  phase: AbsencePhase;
  workYearId?: string;
  note?: string;
}

export interface WorkYear {
  id: string;
  employeeId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  entitlementDays: number;
  historyComplete: boolean;
  allowedParts: number;
  partsBasisRef?: string;
}

export interface CorporateRule {
  code: string; // 'salesMaxConcurrent' | 'summerMaxDays' | 'noticeMonths'
  name: string;
  description: string;
  value: number;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ExceptionRecord {
  id: string;
  preferenceId: string;
  preferenceRevision: number;
  violationsSnapshot: ValidationResult[];
  ruleVersions: Record<string, number>;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  comment?: string;
  createdAt: string;
}

export type ValidationResultKind =
  | 'input_error'
  | 'warning'
  | 'corporate_conflict'
  | 'legal_block'
  | 'legal_review'
  | 'config_review';

export interface ValidationResult {
  code: string;
  kind: ValidationResultKind;
  ruleVersion?: number;
  message: string;
  affectedDates?: string[];
  conflictingEmployeeIds?: string[];
  actual?: number | string;
  limit?: number | string;
  sourceRef?: string;
}

export interface HolidayCalendar {
  year: number;
  dates: string[]; // 'YYYY-MM-DD'
  sourceRefs: string[];
  verifiedAt: string;
}

export interface AppState {
  schemaVersion: string;
  employees: Employee[];
  departments: Department[];
  incompatibilityPairs: IncompatibilityPair[];
  preferences: Preference[];
  existingAbsences: ExistingAbsence[];
  workYears: WorkYear[];
  corporateRules: Record<string, CorporateRule>;
  exceptions: ExceptionRecord[];
  auditEvents: AuditEvent[];
  demoDate: string; // '2026-10-28'
  currentYear: number; // 2027
}

export type Horizon = 'H1' | 'H2' | 'ALL';
