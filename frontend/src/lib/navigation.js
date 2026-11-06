const TABS = new Set(["overview", "employees", "analytics"]);
const QUESTIONS = new Set(["bands", "percentiles", "cohort"]);
const SORTS = new Set(["employee_id", "name", "country", "department", "base_salary", "currency"]);

export function parseUrlState(search = "") {
  const params = new URLSearchParams(search);
  const rawPage = params.get("page") || "1";
  const page = /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Number(rawPage) : 1;
  return {
    tab: TABS.has(params.get("tab")) ? params.get("tab") : "overview",
    page,
    query: params.get("q") || "",
    country: params.get("country") || "",
    department: params.get("department") || "",
    currency: params.get("currency") || "",
    sort: SORTS.has(params.get("sort")) ? params.get("sort") : "employee_id",
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    employeeId: params.get("employee") || "",
    question: QUESTIONS.has(params.get("question")) ? params.get("question") : "bands",
    dept: params.get("dept") ?? "Engineering",
    cohortCountry: params.get("cohort_country") || "United States",
    cohortDepartment: params.get("cohort_department") || "Engineering",
  };
}

export function serializeUrlState(state) {
  const params = new URLSearchParams({ tab: state.tab });
  if (state.tab === "employees") {
    for (const [key, value] of Object.entries({
      q: state.query, country: state.country, department: state.department,
      currency: state.currency, page: state.page > 1 ? state.page : "",
      sort: state.sort !== "employee_id" ? state.sort : "",
      direction: state.direction !== "asc" ? state.direction : "",
    })) {
      if (value) params.set(key, String(value));
    }
  } else if (state.tab === "analytics") {
    if (state.question !== "bands") params.set("question", state.question);
    if (state.dept !== "Engineering") params.set("dept", state.dept);
    if (state.cohortCountry !== "United States") params.set("cohort_country", state.cohortCountry);
    if (state.cohortDepartment !== "Engineering") params.set("cohort_department", state.cohortDepartment);
  }
  if (state.employeeId) params.set("employee", state.employeeId);
  return `?${params}`;
}
