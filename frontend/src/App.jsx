import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmployeeDirectory } from "./components/EmployeeDirectory.jsx";
import { EmployeeModal } from "./components/EmployeeModal.jsx";
import { Icon } from "./components/Icons.jsx";
import { Overview } from "./components/Overview.jsx";
import { PayIntelligence } from "./components/PayIntelligence.jsx";
import { request } from "./lib/api.js";
import { parseUrlState, serializeUrlState } from "./lib/navigation.js";

const PAGE_SIZE = 10;

export function App() {
  const initialUrlState = useMemo(() => parseUrlState(window.location.search), []);

  const [activePage, setActivePage] = useState(initialUrlState.tab);
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState({ employees: [], total: 0, pages: 0, page: initialUrlState.page });
  const [page, setPage] = useState(initialUrlState.page);
  const [queryInput, setQueryInput] = useState(initialUrlState.query);
  const [query, setQuery] = useState(initialUrlState.query);
  const [country, setCountry] = useState(initialUrlState.country);
  const [department, setDepartment] = useState(initialUrlState.department);
  const [currency, setCurrency] = useState(initialUrlState.currency);
  const [sort, setSort] = useState(initialUrlState.sort);
  const [direction, setDirection] = useState(initialUrlState.direction);
  const [analyticsQuestion, setAnalyticsQuestion] = useState(initialUrlState.question);
  const [analyticsDept, setAnalyticsDept] = useState(initialUrlState.dept);

  const [loading, setLoading] = useState(true);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeId, setEmployeeId] = useState(initialUrlState.employeeId);
  const [cohortCountry, setCohortCountry] = useState(initialUrlState.cohortCountry);
  const [cohortDepartment, setCohortDepartment] = useState(initialUrlState.cohortDepartment);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const salaryAttempt = useRef(null);
  const employeeRequestGeneration = useRef(0);
  const employeeQuery = useRef(null);
  employeeQuery.current = { page, sort, direction, query, country, department, currency };

  // Debounce search query input to query filter
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  // Keep the requested employee ID while its profile is loading.
  useEffect(() => {
    const search = serializeUrlState({
      tab: activePage, page, query, country, department, currency, sort, direction,
      employeeId, question: analyticsQuestion, dept: analyticsDept,
      cohortCountry, cohortDepartment,
    });
    if (window.location.search !== search) {
      window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    }
  }, [activePage, page, query, country, department, currency, sort, direction,
    employeeId, analyticsQuestion, analyticsDept, cohortCountry, cohortDepartment]);

  // Handle browser back/forward buttons (popstate)
  useEffect(() => {
    function handlePopState() {
      const state = parseUrlState(window.location.search);
      setActivePage(state.tab);
      setPage(state.page);
      setQueryInput(state.query);
      setQuery(state.query);
      setCountry(state.country);
      setDepartment(state.department);
      setCurrency(state.currency);
      setSort(state.sort);
      setDirection(state.direction);
      setAnalyticsQuestion(state.question);
      setAnalyticsDept(state.dept);
      setCohortCountry(state.cohortCountry);
      setCohortDepartment(state.cohortDepartment);
      setEmployeeId(state.employeeId);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!employeeId) {
      setSelectedEmployee(null);
      setModalLoading(false);
      return;
    }
    const controller = new AbortController();
    setModalLoading(true);
    request(`/api/employees/${encodeURIComponent(employeeId)}`, { signal: controller.signal })
      .then((employee) => {
        if (!controller.signal.aborted) setSelectedEmployee(employee);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause.message);
          setEmployeeId("");
          setSelectedEmployee(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModalLoading(false);
      });
    return () => controller.abort();
  }, [employeeId]);

  const closeEmployee = useCallback(() => {
    setEmployeeId("");
    setSelectedEmployee(null);
    setError("");
  }, []);

  const loadStats = useCallback(async () => {
    const result = await request("/api/stats");
    setStats(result);
  }, []);

  const loadEmployees = useCallback(async () => {
    const filters = employeeQuery.current;
    const params = new URLSearchParams({
      page: String(filters.page),
      page_size: String(PAGE_SIZE),
      sort: filters.sort,
      direction: filters.direction,
    });
    if (filters.query) params.set("q", filters.query);
    if (filters.country) params.set("country", filters.country);
    if (filters.department) params.set("department", filters.department);
    if (filters.currency) params.set("currency", filters.currency);

    const requestId = ++employeeRequestGeneration.current;
    const result = await request(`/api/employees?${params}`);
    return { result, requestId, filters };
  }, []);

  const applyEmployeeResponse = useCallback(({ result, requestId, filters }) => {
    const current = employeeQuery.current;
    const isCurrentQuery = Object.keys(current).every((key) => current[key] === filters[key]);
    if (requestId === employeeRequestGeneration.current && isCurrentQuery) {
      setEmployees(result);
    }
  }, []);

  useEffect(() => {
    let active = true;
    request("/api/stats")
      .then((nextStats) => {
        if (!active) return;
        setStats(nextStats);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;
    setDirectoryLoading(true);
    loadEmployees()
      .then((response) => {
        if (active) applyEmployeeResponse(response);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    applyEmployeeResponse,
    country,
    currency,
    department,
    direction,
    loadEmployees,
    loading,
    page,
    query,
    sort,
  ]);

  const visibleCurrencies = useMemo(() => stats?.currencies ?? [], [stats]);

  function switchTab(newTab) {
    if (activePage !== newTab) {
      setActivePage(newTab);
      setMobileNavOpen(false);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", newTab);
        window.history.pushState(null, "", url.toString());
      }
    }
  }

  function handleSort(column) {
    if (sort === column) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDirection("asc");
    }
    setPage(1);
  }

  function openEmployee(employee) {
    setModalLoading(true);
    setSelectedEmployee(employee);
    setEmployeeId(employee.employee_id);
  }

  async function saveSalary(payload) {
    setSaving(true);
    setError("");
    const body = JSON.stringify(payload);
    const signature = `${selectedEmployee.employee_id}:${body}`;
    if (salaryAttempt.current?.signature !== signature) {
      salaryAttempt.current = { signature, key: crypto.randomUUID() };
    }
    try {
      const updated = await request(
        `/api/employees/${encodeURIComponent(selectedEmployee.employee_id)}`,
        {
          method: "PATCH",
          body,
          headers: { "Idempotency-Key": salaryAttempt.current.key },
        }
      );
      salaryAttempt.current = null;
      setSelectedEmployee(updated);
      setNotice(`Salary updated for ${updated.first_name} ${updated.last_name}.`);
      try {
        const [, nextEmployees] = await Promise.all([loadStats(), loadEmployees()]);
        applyEmployeeResponse(nextEmployees);
      } catch {
        setError("Salary saved. Dashboard refresh failed; use Retry to reload the latest figures.");
      }
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleCohortDrilldown({ country: cohortCountry, department: cohortDept }) {
    setQueryInput("");
    setQuery("");
    setCurrency("");
    setCountry(cohortCountry);
    setDepartment(cohortDept);
    setPage(1);
    switchTab("employees");
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-mark">
          <span />
        </div>
        <p>Preparing your workspace…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchTab("overview");
          }}
        >
          <span className="brand-icon">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="M5 23.5 12.5 8l5 10 3.2-6.1L27 23.5"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7.5 24h17"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-name">
            compwise<span>.</span>
            <small>PEOPLE &amp; PAY</small>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <button
          className={`nav-item ${activePage === "overview" ? "active" : ""}`}
          onClick={() => switchTab("overview")}
        >
          <Icon name="overview" size={19} />
          <span>Overview</span>
        </button>

        <button
          className={`nav-item ${activePage === "employees" ? "active" : ""}`}
          onClick={() => switchTab("employees")}
        >
          <Icon name="people" size={19} />
          <span>Employees</span>
          <span className="nav-count">10k</span>
        </button>

        <button
          className={`nav-item ${activePage === "analytics" ? "active" : ""}`}
          onClick={() => switchTab("analytics")}
        >
          <Icon name="chart" size={19} />
          <span>Pay Intelligence</span>
          <span className="nav-badge-pill">NEW</span>
        </button>

        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">
              <Icon name="shield" size={16} />
            </span>
            <div>
              <strong>Private by design</strong>
              <span>
                Salary data is sensitive.
                <br />
                Handle with care.
              </span>
            </div>
          </div>
          <div className="profile">
            <span className="profile-avatar">HR</span>
            <span className="profile-details">
              <strong>HR Manager</strong>
              <small>ACME Corporation</small>
            </span>
            <button className="profile-more" aria-label="Account options">
              <span>···</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumbs">
            <span>ACME Corporation</span>
            <Icon name="chevron" size={14} />
            <strong>
              {activePage === "overview"
                ? "Overview"
                : activePage === "employees"
                ? "Employees"
                : "Pay Intelligence"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <span /> DEMO DATA
            </span>
            <span className="topbar-divider" />
            <span className="topbar-date">
              <Icon name="clock" size={15} /> {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </header>

        <div className="page-content">
          {stats?.demo?.ephemeral_storage && (
            <div className="alert" role="note">
              Free assessment demo: salary edits reset when the server restarts. All employee records are fictional.
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              <span>{error}</span>
              <div className="alert-actions">
                <button
                  className="text-button alert-retry-btn"
                  onClick={() => {
                    setError("");
                    loadStats().catch((err) => setError(err.message));
                    loadEmployees()
                      .then(applyEmployeeResponse)
                      .catch((err) => setError(err.message));
                  }}
                >
                  Retry
                </button>
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          )}
          {notice && (
            <div className="alert alert-success" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notification">
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()} <span className="eyebrow-spark">✳</span> PEOPLE OPERATIONS
              </div>
              <h1>
                {activePage === "overview"
                  ? "Compensation overview"
                  : activePage === "employees"
                  ? "Employee directory"
                  : "Pay Intelligence"}
              </h1>
              <p>
                {activePage === "overview"
                  ? "A clear picture of how your organization pays people across 10 countries."
                  : activePage === "employees"
                  ? "Search, filter, and manage compensation across your 10,000 employees."
                  : "Answering strategic questions on role bands, salary percentiles, and pay dispersion."}
              </p>
            </div>

            {activePage === "overview" && (
              <div className="heading-actions">
                <button
                  className="secondary-button"
                  onClick={() => switchTab("analytics")}
                >
                  <Icon name="chart" size={16} /> Pay Intelligence
                </button>
                <button
                  className="primary-button"
                  onClick={() => switchTab("employees")}
                >
                  <Icon name="people" size={17} /> View employees
                </button>
              </div>
            )}
          </div>

          {activePage === "overview" && (
            <Overview
              stats={stats}
              onNavigateToTab={switchTab}
              onFilterCountry={(c) => {
                setCountry(c);
                setPage(1);
                switchTab("employees");
              }}
              childrenSnippetTable={
                <EmployeeDirectory
                  employees={employees}
                  page={page}
                  pageSize={PAGE_SIZE}
                  queryInput={queryInput}
                  setQueryInput={setQueryInput}
                  country={country}
                  setCountry={setCountry}
                  department={department}
                  setDepartment={setDepartment}
                  currency={currency}
                  setCurrency={setCurrency}
                  sort={sort}
                  direction={direction}
                  onSort={handleSort}
                  onPageChange={setPage}
                  directoryLoading={directoryLoading}
                  onSelectEmployee={openEmployee}
                  stats={stats}
                  isOverviewSnippet
                  onViewAll={() => switchTab("employees")}
                />
              }
            />
          )}

          {activePage === "employees" && (
            <EmployeeDirectory
              employees={employees}
              page={page}
              pageSize={PAGE_SIZE}
              queryInput={queryInput}
              setQueryInput={setQueryInput}
              country={country}
              setCountry={setCountry}
              department={department}
              setDepartment={setDepartment}
              currency={currency}
              setCurrency={setCurrency}
              sort={sort}
              direction={direction}
              onSort={handleSort}
              onPageChange={setPage}
              directoryLoading={directoryLoading}
              onSelectEmployee={openEmployee}
              stats={stats}
            />
          )}

          {activePage === "analytics" && (
            <PayIntelligence
              stats={stats}
              onNavigateToDirectory={handleCohortDrilldown}
              activeQuestion={analyticsQuestion}
              onQuestionChange={setAnalyticsQuestion}
              selectedDept={analyticsDept}
              onDeptChange={setAnalyticsDept}
              cohortCountry={cohortCountry}
              onCohortCountryChange={setCohortCountry}
              cohortDepartment={cohortDepartment}
              onCohortDepartmentChange={setCohortDepartment}
            />
          )}

          <footer className="page-footer">
            <span>
              © 2026 ACME Corporation <span className="footer-dot">·</span> Compensation workspace
            </span>
            <span>
              <Icon name="shield" size={14} /> Confidential — for internal HR use only
            </span>
          </footer>
        </div>
      </main>

      <EmployeeModal
        key={employeeId}
        selectedEmployee={selectedEmployee}
        modalLoading={modalLoading}
        onClose={closeEmployee}
        onSaveSalary={saveSalary}
        visibleCurrencies={visibleCurrencies}
        saving={saving}
      />
    </div>
  );
}

export default App;
