import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmployeeDirectory } from "./components/EmployeeDirectory.jsx";
import { EmployeeModal } from "./components/EmployeeModal.jsx";
import { Icon } from "./components/Icons.jsx";
import { Overview } from "./components/Overview.jsx";
import { PayIntelligence } from "./components/PayIntelligence.jsx";

const PAGE_SIZE = 10;

export function getInitialUrlState() {
  if (typeof window === "undefined") {
    return {
      tab: "overview",
      page: 1,
      query: "",
      country: "",
      department: "",
      currency: "",
      sort: "employee_id",
      direction: "asc",
      employeeId: "",
      question: "bands",
      dept: "Engineering",
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get("tab") || "overview";
  const tab = ["overview", "employees", "analytics"].includes(rawTab) ? rawTab : "overview";
  const rawPage = parseInt(params.get("page") || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const query = params.get("q") || "";
  const country = params.get("country") || "";
  const department = params.get("department") || "";
  const currency = params.get("currency") || "";
  const sort = params.get("sort") || "employee_id";
  const direction = params.get("direction") === "desc" ? "desc" : "asc";
  const employeeId = params.get("employee") || "";
  const question = params.get("question") || "bands";
  const dept = params.get("dept") || "Engineering";

  return {
    tab,
    page,
    query,
    country,
    department,
    currency,
    sort,
    direction,
    employeeId,
    question,
    dept,
  };
}

async function request(path, options) {
  try {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Something went wrong. Please try again.");
    }
    return payload;
  } catch (err) {
    if (err.name === "TypeError" && (err.message.includes("fetch") || err.message.includes("network"))) {
      throw new Error(
        "Unable to connect to the backend API server. Please ensure the API is running at http://127.0.0.1:8000 (npm run api)."
      );
    }
    throw err;
  }
}

export function App() {
  const initialUrlState = useMemo(() => getInitialUrlState(), []);

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
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const employeeRequestGeneration = useRef(0);
  const employeeQuery = useRef(null);
  employeeQuery.current = { page, sort, direction, query, country, department, currency };

  // Debounce search query input to query filter
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  // Synchronize active state with URL Query Parameters so refresh / sharing preserves full state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const params = url.searchParams;

    params.set("tab", activePage);

    if (activePage === "employees") {
      if (query) params.set("q", query); else params.delete("q");
      if (country) params.set("country", country); else params.delete("country");
      if (department) params.set("department", department); else params.delete("department");
      if (currency) params.set("currency", currency); else params.delete("currency");
      if (page > 1) params.set("page", String(page)); else params.delete("page");
      if (sort !== "employee_id") params.set("sort", sort); else params.delete("sort");
      if (direction !== "asc") params.set("direction", direction); else params.delete("direction");
      params.delete("question");
      params.delete("dept");
    } else if (activePage === "analytics") {
      if (analyticsQuestion && analyticsQuestion !== "bands") {
        params.set("question", analyticsQuestion);
      } else {
        params.delete("question");
      }
      if (analyticsDept && analyticsDept !== "Engineering") {
        params.set("dept", analyticsDept);
      } else {
        params.delete("dept");
      }
      params.delete("q");
      params.delete("country");
      params.delete("department");
      params.delete("currency");
      params.delete("page");
      params.delete("sort");
      params.delete("direction");
    } else {
      params.delete("q");
      params.delete("country");
      params.delete("department");
      params.delete("currency");
      params.delete("page");
      params.delete("sort");
      params.delete("direction");
      params.delete("question");
      params.delete("dept");
    }

    if (selectedEmployee) {
      params.set("employee", selectedEmployee.employee_id);
    } else {
      params.delete("employee");
    }

    const newSearch = params.toString() ? `?${params.toString()}` : "";
    if (window.location.search !== newSearch) {
      window.history.replaceState(null, "", `${url.pathname}${newSearch}`);
    }
  }, [
    activePage,
    page,
    query,
    country,
    department,
    currency,
    sort,
    direction,
    selectedEmployee,
    analyticsQuestion,
    analyticsDept,
  ]);

  // Handle browser back/forward buttons (popstate)
  useEffect(() => {
    function handlePopState() {
      const state = getInitialUrlState();
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
      if (state.employeeId) {
        request(`/api/employees/${encodeURIComponent(state.employeeId)}`)
          .then(setSelectedEmployee)
          .catch(() => setSelectedEmployee(null));
      } else {
        setSelectedEmployee(null);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // On initial mount: if URL contains an employee ID, open their modal directly
  useEffect(() => {
    const initial = getInitialUrlState();
    if (initial.employeeId) {
      setModalLoading(true);
      request(`/api/employees/${encodeURIComponent(initial.employeeId)}`)
        .then(setSelectedEmployee)
        .catch(() => {})
        .finally(() => setModalLoading(false));
    }
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

  async function openEmployee(employee) {
    setSelectedEmployee(employee);
    setModalLoading(true);
    try {
      const full = await request(`/api/employees/${encodeURIComponent(employee.employee_id)}`);
      setSelectedEmployee(full);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setModalLoading(false);
    }
  }

  async function saveSalary(payload) {
    setSaving(true);
    setError("");
    try {
      const updated = await request(
        `/api/employees/${encodeURIComponent(selectedEmployee.employee_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
      setSelectedEmployee(updated);
      setNotice(`Salary updated for ${updated.first_name} ${updated.last_name}.`);
      const [, nextEmployees] = await Promise.all([loadStats(), loadEmployees()]);
      applyEmployeeResponse(nextEmployees);
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleCohortDrilldown({ country: cohortCountry, department: cohortDept }) {
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
              <Icon name="clock" size={15} /> November 5, 2026
            </span>
          </div>
        </header>

        <div className="page-content">
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
                THURSDAY, NOVEMBER 5, 2026 <span className="eyebrow-spark">✳</span> PEOPLE OPERATIONS
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
                  : "Answering strategic questions on role bands, salary percentiles, and pay equity."}
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
        selectedEmployee={selectedEmployee}
        modalLoading={modalLoading}
        onClose={() => {
          setSelectedEmployee(null);
          setError("");
        }}
        onSaveSalary={saveSalary}
        visibleCurrencies={visibleCurrencies}
        saving={saving}
      />
    </div>
  );
}

export default App;
