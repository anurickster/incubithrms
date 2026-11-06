import assert from "node:assert/strict";
import test from "node:test";
import { dateAfter, todayUtc } from "./dates.js";
import { parseUrlState, serializeUrlState } from "./navigation.js";

test("effective date helper handles leap days and year boundaries", () => {
  assert.equal(dateAfter("2024-02-28"), "2024-02-29");
  assert.equal(dateAfter("2026-02-28"), "2026-03-01");
  assert.equal(dateAfter("2026-12-31"), "2027-01-01");
  assert.equal(dateAfter(""), "");
  assert.equal(todayUtc(new Date("2026-11-06T01:00:00+05:30")), "2026-11-05");
});

test("employee deep link survives parsing and serialization while profile loads", () => {
  const state = parseUrlState("?tab=employees&q=Aarav&country=India&page=3&employee=ACME-00042");
  assert.equal(state.employeeId, "ACME-00042");
  assert.equal(state.page, 3);
  assert.deepEqual(parseUrlState(serializeUrlState(state)), state);
});

test("malformed URL states fall back to supported tabs, questions, sorts, and pages", () => {
  for (const page of ["0", "-1", "1.5", "3abc", "Infinity", "9007199254740992"]) {
    const state = parseUrlState(`?tab=bad&sort=bad&question=bad&page=${page}`);
    assert.equal(state.tab, "overview");
    assert.equal(state.question, "bands");
    assert.equal(state.sort, "employee_id");
    assert.equal(state.page, 1);
  }
});

test("analytics round trip preserves selected cohort and all-departments selection", () => {
  const state = parseUrlState("?tab=analytics&question=cohort&dept=&cohort_country=Germany&cohort_department=Engineering");
  assert.equal(state.dept, "");
  assert.equal(state.cohortCountry, "Germany");
  assert.deepEqual(parseUrlState(serializeUrlState(state)), state);
});

test("closing a profile removes its URL parameter and tab switches remove irrelevant filters", () => {
  const state = parseUrlState("?tab=employees&q=Aisha&country=India&employee=ACME-00001");
  const search = serializeUrlState({ ...state, tab: "analytics", employeeId: "" });
  assert.equal(search, "?tab=analytics");
});
