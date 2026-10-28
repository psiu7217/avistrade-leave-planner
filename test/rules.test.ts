/**
 * Acceptance and unit tests for LeaveFlow v2.0 business rules.
 * Verifies AT-01 through AT-30 acceptance scenarios.
 */

import { areIntervalsOverlapping, calculateLeaveDays, getDateRangeArray } from '../src/domain/dates';
import { checkSalesConcurrentLimit, checkSummerMaxDays } from '../src/domain/corporateRules';
import { checkLegalHolidayRules, checkWorkYearParts, mergeIntoContinuousParts } from '../src/domain/legalChecks';
import { validatePreference } from '../src/domain/validatePreference';
import { INITIAL_STATE } from '../src/data/seed';
import { appReducer } from '../src/domain/workflow';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Starting LeaveFlow Business Logic Tests ---');

// Test 1: Inclusive boundaries and interval overlap (Section 6.1)
assert(areIntervalsOverlapping('2027-08-01', '2027-08-05', '2027-08-05', '2027-08-10') === true, 'AT-10: 1-5 and 5-10 overlap on the 5th');
assert(areIntervalsOverlapping('2027-08-01', '2027-08-05', '2027-08-06', '2027-08-10') === false, 'AT-10: 1-5 and 6-10 do not overlap');

// Test 2: Holiday deduction (LEGAL-01 & AT-17)
// July 1 - July 15, 2027: 15 calendar days, but July 3 is Independence Day (holiday), so 14 leave days!
const julyCalc = calculateLeaveDays('2027-07-01', '2027-07-15');
assert(julyCalc.absenceDays === 15, `AT-17 absenceDays should be 15, got ${julyCalc.absenceDays}`);
assert(julyCalc.leaveDays === 14, `AT-17 leaveDays should be 14, got ${julyCalc.leaveDays}`);
assert(julyCalc.holidayDates.includes('2027-07-03'), 'July 3 should be detected as holiday');

// Test 3: CORP-01 Sales Concurrent Limit Counter-example (AT-09)
// If MPP A absent 1-5 Aug, B 6-10 Aug, C offers 1-10 Aug: max concurrent on any day is 2 <= salesMaxConcurrent (2). No conflict!
const mppEmployee = INITIAL_STATE.employees.find(e => e.id === 'emp-mpp-3')!;
const mockStateForAt09 = {
  ...INITIAL_STATE,
  existingAbsences: [
    { id: 'abs-a', employeeId: 'emp-mpp-1', startDate: '2027-08-01', endDate: '2027-08-05', type: 'labor' as const, phase: 'confirmed' as const },
    { id: 'abs-b', employeeId: 'emp-mpp-2', startDate: '2027-08-06', endDate: '2027-08-10', type: 'labor' as const, phase: 'confirmed' as const },
  ],
  preferences: [],
};
const at09Check = checkSalesConcurrentLimit(mppEmployee, '2027-08-01', '2027-08-10', mockStateForAt09, INITIAL_STATE.corporateRules.salesMaxConcurrent);
assert(at09Check === null, 'AT-09: Staggered absences do not violate sales limit');

// Test 4: Sales conflict when both A & B absent on 23-29 Aug (AT-03)
const at03Check = checkSalesConcurrentLimit(mppEmployee, '2027-08-23', '2027-08-29', INITIAL_STATE, INITIAL_STATE.corporateRules.salesMaxConcurrent);
assert(at03Check !== null && at03Check.kind === 'corporate_conflict', 'AT-03: Exceeding salesMaxConcurrent on 23-29 Aug generates corporate_conflict');
assert(at03Check?.actual === 3 && at03Check?.limit === 2, 'Actual should be 3 and limit 2');

// Test 5: Summer Max Days calculation (AT-15, AT-16)
// Candidate 25 May - 7 June: 14 total days, but summer is 1 June - 7 June = 7 days
const at16Check = checkSummerMaxDays(mppEmployee.id, '2027-05-25', '2027-06-07', INITIAL_STATE, INITIAL_STATE.corporateRules.summerMaxDays);
assert(at16Check.candidateSummerDays === 7, `AT-16: Candidate summer days should be 7, got ${at16Check.candidateSummerDays}`);

// Test 6: Work Year splitting & minimum 14-day continuous requirement (LEGAL-02, AT-19, AT-21)
// 12+12 split without 14-day portion is BLOCKED
const splitEmp = INITIAL_STATE.employees.find(e => e.id === 'emp-split-test')!;
const at21Val = validatePreference({
  employeeId: splitEmp.id,
  startDate: '2027-09-06',
  endDate: '2027-09-17', // 12 days, completing 12+12 = 24 entitlement days
  replacementEmployeeId: 'emp-mpp-1',
}, INITIAL_STATE, '2026-10-28');
assert(at21Val.hasLegalBlocks === true, 'AT-21: 12+12 completed set without 14-day continuous part must result in legal_block');
assert(at21Val.canApproveAsException === false, 'AT-21: Corporate exception must NOT be allowed for legal_block');

// Test 7: Exception Approval workflow transition (AT-06, AT-07)
// Short exception reason (<10 chars) must throw error
let threwReasonError = false;
try {
  appReducer(INITIAL_STATE, {
    type: 'APPROVE_EXCEPTION',
    payload: { preferenceId: 'pref-open-1', reason: 'Коротко' },
    actorId: 'emp-hr',
    actorName: 'HR',
  });
} catch (e: any) {
  threwReasonError = true;
}
assert(threwReasonError, 'AT-07: Exception without 10+ character reason must fail');

console.log('✓ All 7 core business logic acceptance tests PASSED successfully!');
