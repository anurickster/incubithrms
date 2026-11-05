import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCompactCount, formatMoney, initials } from "./lib/format.js";

const PAGE_SIZE = 10;

function dateAfter(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    overview: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m7 10 5 5 5-5" />,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Avatar({ firstName, lastName, small = false }) {
  const colors = ["lavender", "mint", "peach", "blue", "rose"];
  const color = colors[((firstName?.charCodeAt(0) ?? 0) + (lastName?.charCodeAt(0) ?? 0)) % colors.length];
  return (
    <span className={`avatar ${small ? "avatar-small" : ""} avatar-${color}`}>
      {initials(firstName, lastName)}
    </span>
  );
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState({ employees: [], total: 0, pages: 0, page: 1 });
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [department, setDepartment] = useState("");
  const [currency, setCurrency] = useState("");
  const [breakdownType, setBreakdownType] = useState("country");
  const [breakdownSelection, setBreakdownSelection] = useState("");
  const [sort, setSort] = useState("employee_id");
  const [direction, setDirection] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const employeeRequestGeneration = useRef(0);
  const employeeQuery = useRef(null);
  employeeQuery.current = { page, sort, direction, query, country, department, currency };

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

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
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;
    setDirectoryLoading(true);
    loadEmployees()
      .then((response) => { if (active) applyEmployeeResponse(response); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setDirectoryLoading(false); });
    return () => { active = false; };
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
  const maxCountryCount = Math.max(...(stats?.countries?.map((row) => row.headcount) ?? [1]), 1);
  const breakdownField = breakdownType === "country" ? "country" : "department";
  const breakdownOptions = stats?.[breakdownType === "country" ? "countries" : "departments"] ?? [];
  const selectedBreakdown = breakdownOptions.find((row) => row[breakdownField] === breakdownSelection)
    ?? breakdownOptions[0];
  const compensationRows = (stats?.[
    breakdownType === "country" ? "compensation_by_country" : "compensation_by_department"
  ] ?? []).filter((row) => row[breakdownField] === selectedBreakdown?.[breakdownField]);
  const minimumEffectiveDate = selectedEmployee ? dateAfter(selectedEmployee.salary_effective_date) : "";
  const salaryChangeUnavailable = selectedEmployee && minimumEffectiveDate > localToday();
  const defaultEffectiveDate = selectedEmployee
    ? salaryChangeUnavailable ? localToday() : [localToday(), minimumEffectiveDate].sort().at(-1)
    : "";

  function updateFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  function handleSort(column) {
    if (sort === column) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSort(column);
      setDirection("asc");
    }
    setPage(1);
  }

  async function openEmployee(employee) {
    setSelectedEmployee(employee);
    setEditing(false);
    setModalLoading(true);
    try {
      setSelectedEmployee(await request(`/api/employees/${encodeURIComponent(employee.employee_id)}`));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setModalLoading(false);
    }
  }

  async function saveSalary(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const updated = await request(`/api/employees/${encodeURIComponent(selectedEmployee.employee_id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          base_salary: form.get("base_salary"),
          currency: form.get("currency"),
          effective_date: form.get("effective_date"),
        }),
      });
      setSelectedEmployee(updated);
      setEditing(false);
      setNotice(`Salary updated for ${updated.first_name} ${updated.last_name}.`);
      const [, nextEmployees] = await Promise.all([loadStats(), loadEmployees()]);
      applyEmployeeResponse(nextEmployees);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  function closeModal() {
    setSelectedEmployee(null);
    setEditing(false);
    setError("");
  }

  const employeeTable = (
    <section className="card directory-card">
      <div className="table-heading">
        <div>
          <div className="section-title">{activePage === "overview" ? "Recently added" : "Employee directory"}</div>
          <div className="section-subtitle">
            {formatCompactCount(employees.total)} team members
            {activePage === "overview" && <span className="heading-dot">·</span>}
            {activePage === "overview" && <span className="live-hint"><span className="live-dot" /> Live data</span>}
          </div>
        </div>
        {activePage === "overview" ? (
          <button className="text-button" onClick={() => setActivePage("employees")}>
            View directory <Icon name="chevron" size={16} />
          </button>
        ) : (
          <div className="result-count">
            Showing {employees.total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, employees.total)} of {formatCompactCount(employees.total)}
          </div>
        )}
      </div>
      {activePage === "employees" && (
        <div className="filters">
          <label className="search-field">
            <Icon name="search" size={18} />
            <input
              aria-label="Search employees"
              placeholder="Search name, email or ID"
              value={queryInput}
              onChange={(event) => updateFilter(setQueryInput, event.target.value)}
            />
            {queryInput && <button className="clear-search" onClick={() => updateFilter(setQueryInput, "")} aria-label="Clear search"><Icon name="close" size={14} /></button>}
          </label>
          <select aria-label="Filter by country" value={country} onChange={(event) => updateFilter(setCountry, event.target.value)}>
            <option value="">All countries</option>
            {stats?.countries.map((row) => <option key={row.country}>{row.country}</option>)}
          </select>
          <select aria-label="Filter by department" value={department} onChange={(event) => updateFilter(setDepartment, event.target.value)}>
            <option value="">All departments</option>
            {stats?.departments.map((row) => <option key={row.department}>{row.department}</option>)}
          </select>
          <select aria-label="Filter by currency" value={currency} onChange={(event) => updateFilter(setCurrency, event.target.value)}>
            <option value="">All currencies</option>
            {visibleCurrencies.map((row) => <option key={row.currency}>{row.currency}</option>)}
          </select>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><button onClick={() => handleSort("employee_id")}>Employee <SortMark active={sort === "employee_id"} direction={direction} /></button></th>
              <th>Department</th>
              <th>Location</th>
              <th><button onClick={() => handleSort("base_salary")}>Base salary <SortMark active={sort === "base_salary"} direction={direction} /></button></th>
              <th>Effective from</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {directoryLoading && employees.employees.length === 0 ? (
              <tr><td colSpan="6"><div className="table-loading">Loading employee records…</div></td></tr>
            ) : employees.employees.length === 0 ? (
              <tr><td colSpan="6"><div className="empty-state"><span className="empty-icon"><Icon name="search" size={22} /></span><strong>No employees found</strong><span>Try adjusting your search or filters.</span><button className="text-button" onClick={() => { updateFilter(setQueryInput, ""); updateFilter(setCountry, ""); updateFilter(setDepartment, ""); updateFilter(setCurrency, ""); }}>Clear all filters</button></div></td></tr>
            ) : employees.employees.map((employee) => (
              <tr className="employee-row" key={employee.employee_id} onClick={() => openEmployee(employee)}>
                <td>
                  <div className="employee-cell">
                    <Avatar firstName={employee.first_name} lastName={employee.last_name} small />
                    <div className="employee-identity">
                      <span className="employee-name">{employee.first_name} {employee.last_name}</span>
                      <span className="employee-id">{employee.employee_id}</span>
                    </div>
                  </div>
                </td>
                <td><div className="department-cell"><span className={`department-mark department-${employee.department.toLowerCase().replace(/[^a-z]+/g, "-")}`} />{employee.department}</div></td>
                <td><div className="location-cell"><Icon name="globe" size={15} />{employee.country}</div></td>
                <td><span className="salary-value">{formatMoney(employee.base_salary, employee.currency)}</span><span className="currency-tag">{employee.currency}</span></td>
                <td><span className="date-cell">{employee.salary_effective_date}</span></td>
                <td><button className="row-action" aria-label={`View ${employee.first_name} ${employee.last_name}`} onClick={(event) => { event.stopPropagation(); openEmployee(employee); }}><Icon name="chevron" size={17} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {activePage === "employees" && (
        <div className="pagination">
          <span>Page {employees.pages ? page : 0} of {employees.pages || 0}</span>
          <div className="pagination-actions">
            <button disabled={page <= 1 || directoryLoading} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button disabled={page >= employees.pages || directoryLoading} onClick={() => setPage((value) => value + 1)}>Next <Icon name="chevron" size={15} /></button>
          </div>
        </div>
      )}
    </section>
  );

  if (loading) return <div className="app-loading"><div className="loading-mark"><span /></div><p>Preparing your workspace…</p></div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage("overview"); }}>
          <span className="brand-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 23.5 12.5 8l5 10 3.2-6.1L27 23.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M7.5 24h17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
          <span className="brand-name">compwise<span>.</span><small>PEOPLE &amp; PAY</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button className={`nav-item ${activePage === "overview" ? "active" : ""}`} onClick={() => { setActivePage("overview"); setMobileNavOpen(false); }}>
          <Icon name="overview" size={19} /><span>Overview</span>
        </button>
        <button className={`nav-item ${activePage === "employees" ? "active" : ""}`} onClick={() => { setActivePage("employees"); setMobileNavOpen(false); }}>
          <Icon name="people" size={19} /><span>Employees</span><span className="nav-count">10k</span>
        </button>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon"><Icon name="shield" size={16} /></span>
            <div><strong>Private by design</strong><span>Salary data is sensitive.<br />Handle with care.</span></div>
          </div>
          <div className="profile">
            <span className="profile-avatar">HR</span>
            <span className="profile-details"><strong>HR Manager</strong><small>ACME Corporation</small></span>
            <button className="profile-more" aria-label="Account options"><span>···</span></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setMobileNavOpen((open) => !open)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>ACME Corporation</span><Icon name="chevron" size={14} /><strong>{activePage === "overview" ? "Overview" : "Employees"}</strong></div>
          <div className="topbar-right">
            <span className="demo-badge"><span /> DEMO DATA</span>
            <span className="topbar-divider" />
            <span className="topbar-date"><Icon name="clock" size={15} /> November 5, 2026</span>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="alert alert-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><Icon name="close" size={16} /></button></div>}

          <div className="page-heading">
            <div><div className="eyebrow">THURSDAY, NOVEMBER 5, 2026 <span className="eyebrow-spark">✳</span> PEOPLE OPERATIONS</div><h1>{activePage === "overview" ? "Compensation overview" : "Employee directory"}</h1><p>{activePage === "overview" ? "A clear picture of how your organization pays people." : "Search and manage compensation across your organization."}</p></div>
            {activePage === "overview" && <button className="primary-button" onClick={() => setActivePage("employees")}><Icon name="people" size={17} /> View employees</button>}
          </div>

          {activePage === "overview" ? (
            <>
              <div className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top"><span className="stat-icon stat-icon-indigo"><Icon name="people" size={19} /></span><span className="stat-caption">ACROSS THE ORG</span></div>
                  <div className="stat-value">{formatCompactCount(stats?.employee_count ?? 0)}</div><div className="stat-label">Total employees</div>
                  <div className="stat-foot"><span className="foot-indicator"><span className="live-dot" /> Active workforce</span></div>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span className="stat-icon stat-icon-blue"><Icon name="globe" size={19} /></span><span className="stat-caption">GLOBAL REACH</span></div>
                  <div className="stat-value">{String(stats?.country_count ?? 0).padStart(2, "0")} <span className="stat-unit">countries</span></div><div className="stat-label">Where we work</div>
                  <div className="stat-foot"><span className="flag-cluster">{stats?.countries.slice(0, 5).map((row) => <span key={row.country} title={row.country}>{countryMark(row.country)}</span>)}</span><span className="foot-note">Across 5 regions</span></div>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span className="stat-icon stat-icon-green"><Icon name="overview" size={19} /></span><span className="stat-caption">ORGANIZATION</span></div>
                  <div className="stat-value">{String(stats?.department_count ?? 0).padStart(2, "0")} <span className="stat-unit">teams</span></div><div className="stat-label">Distinct departments</div>
                  <div className="stat-foot"><span className="department-foot-mark"><span /><span /><span /><span /></span><span className="foot-note">Working as one</span></div>
                </article>
              </div>

              <div className="dashboard-grid">
                <section className="card pay-card">
                  <div className="card-heading">
                    <div><div className="section-title">Salary benchmarks</div><div className="section-subtitle">Averages by currency <span className="info-dot" title="Salaries are grouped by currency and never converted or added across currencies.">i</span></div></div>
                    <span className="period-tag">CURRENT BASE SALARY</span>
                  </div>
                  <div className="currency-list">
                    {visibleCurrencies.map((row, index) => {
                      const colors = ["#7268e7", "#21a67a", "#e7a13a", "#5a9ae6", "#dd7897", "#34a7ad", "#9772d5", "#da7962", "#68a774", "#c27caa"];
                      return <div className="currency-row" key={row.currency}>
                        <span className="currency-symbol" style={{ "--currency-color": colors[index % colors.length] }}>{currencySymbol(row.currency)}</span>
                        <span className="currency-code">{row.currency}</span>
                        <span className="currency-progress"><span style={{ width: `${Math.min(100, Math.max(12, row.headcount / Math.max(...visibleCurrencies.map((item) => item.headcount)) * 100))}%`, background: colors[index % colors.length] }} /></span>
                        <span className="currency-average">{formatMoney(row.average_salary, row.currency)}<small>avg</small></span>
                        <span className="currency-headcount">{formatCompactCount(row.headcount)} <small>people</small></span>
                      </div>;
                    })}
                  </div>
                  <div className="pay-footnote"><Icon name="shield" size={15} /><span>Benchmarks are calculated within each currency group. No FX conversion applied.</span></div>
                </section>

                <section className="card countries-card">
                  <div className="card-heading"><div><div className="section-title">Where we work</div><div className="section-subtitle">Team distribution by country</div></div><span className="round-icon"><Icon name="globe" size={16} /></span></div>
                  <div className="country-list">
                    {stats?.countries.slice(0, 6).map((row) => <div className="country-row" key={row.country}>
                      <span className="country-flag">{countryMark(row.country)}</span><span className="country-name">{row.country}</span>
                      <span className="country-bar"><span style={{ width: `${Math.max(3, row.headcount / maxCountryCount * 100)}%` }} /></span>
                      <span className="country-count">{formatCompactCount(row.headcount)}</span>
                    </div>)}
                  </div>
                  <button className="country-link" onClick={() => { setActivePage("employees"); setCountry(""); }}>
                    View all countries <Icon name="arrow" size={14} />
                  </button>
                </section>
              </div>
              <section className="card compensation-card">
                <div className="card-heading">
                  <div><div className="section-title">Pay breakdown</div><div className="section-subtitle">Compare salary benchmarks without blending currencies</div></div>
                  <div className="breakdown-controls">
                    <div className="breakdown-tabs" role="tablist" aria-label="Compensation breakdown">
                      <button role="tab" aria-selected={breakdownType === "country"} className={breakdownType === "country" ? "selected" : ""} onClick={() => { setBreakdownType("country"); setBreakdownSelection(""); }}>Country</button>
                      <button role="tab" aria-selected={breakdownType === "department"} className={breakdownType === "department" ? "selected" : ""} onClick={() => { setBreakdownType("department"); setBreakdownSelection(""); }}>Department</button>
                    </div>
                    <select aria-label={`Select ${breakdownType}`} value={selectedBreakdown?.[breakdownField] ?? ""} onChange={(event) => setBreakdownSelection(event.target.value)}>
                      {breakdownOptions.map((row) => <option key={row[breakdownField]} value={row[breakdownField]}>{row[breakdownField]}</option>)}
                    </select>
                  </div>
                </div>
                <div className="salary-breakdown-grid">
                  {compensationRows.map((row) => <article className="salary-breakdown-item" key={`${row[breakdownField]}-${row.currency}`}>
                    <div className="breakdown-currency"><span className="currency-symbol">{currencySymbol(row.currency)}</span><strong>{row.currency}</strong><span>{formatCompactCount(row.headcount)} people</span></div>
                    <div className="breakdown-metrics"><div><span>AVERAGE</span><strong>{formatMoney(row.average_salary, row.currency)}</strong></div><div><span>MEDIAN</span><strong>{formatMoney(row.median_salary, row.currency)}</strong></div></div>
                  </article>)}
                  {compensationRows.length === 0 && <span className="breakdown-empty">No salary data for this selection yet.</span>}
                </div>
                <div className="breakdown-footnote"><Icon name="shield" size={14} /> Each benchmark is calculated only among employees paid in the same currency.</div>
              </section>
              {employeeTable}
            </>
          ) : employeeTable}

          <footer className="page-footer"><span>© 2026 ACME Corporation <span className="footer-dot">·</span> Compensation workspace</span><span><Icon name="shield" size={14} /> Confidential — for internal use only</span></footer>
        </div>
      </main>

      {selectedEmployee && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }} role="presentation">
          <section className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-top">
              <span className="modal-kicker">{editing ? "UPDATE COMPENSATION" : "EMPLOYEE PROFILE"}</span>
              <button className="modal-close" onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
            </div>
            <div className="modal-person">
              <Avatar firstName={selectedEmployee.first_name} lastName={selectedEmployee.last_name} />
              <div><h2 id="modal-title">{selectedEmployee.first_name} {selectedEmployee.last_name}</h2><span>{selectedEmployee.job_title} <span className="person-dot">·</span> {selectedEmployee.department}</span></div>
            </div>
            {modalLoading ? <div className="modal-loading">Loading profile…</div> : editing ? (
              <form className="salary-form" onSubmit={saveSalary}>
                <div className="form-section-label">SALARY DETAILS <span>Only current base salary is editable</span></div>
                <label>Annual base salary
                  <div className="input-prefix"><span>{currencySymbol(selectedEmployee.currency)}</span><input name="base_salary" type="number" min="0.01" max="1000000000" step="0.01" defaultValue={selectedEmployee.base_salary} required autoFocus /></div>
                </label>
                <div className="form-row">
                  <label>Currency<select name="currency" defaultValue={selectedEmployee.currency}>{(visibleCurrencies.some((item) => item.currency === selectedEmployee.currency) ? visibleCurrencies : [...visibleCurrencies, { currency: selectedEmployee.currency }]).map((item) => <option key={item.currency}>{item.currency}</option>)}</select></label>
                  <label>Effective date<input name="effective_date" type="date" min={minimumEffectiveDate} max={localToday()} defaultValue={defaultEffectiveDate} required disabled={salaryChangeUnavailable} /></label>
                </div>
                <div className="form-note"><Icon name="clock" size={15} /><span>{salaryChangeUnavailable ? "A salary change is already recorded for today. Another change can be made tomorrow." : "Changes are recorded in salary history and take effect on the selected date. Future-dated changes are not supported."}</span></div>
                <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving || salaryChangeUnavailable}>{saving ? "Saving…" : "Save changes"}</button></div>
              </form>
            ) : (
              <>
                <div className="profile-details-grid">
                  <div><span>EMPLOYEE ID</span><strong>{selectedEmployee.employee_id}</strong></div>
                  <div><span>LOCATION</span><strong>{countryMark(selectedEmployee.country)} {selectedEmployee.country}</strong></div>
                  <div><span>EMAIL</span><strong className="profile-email">{selectedEmployee.email}</strong></div>
                  <div><span>HIRE DATE</span><strong>{selectedEmployee.hire_date}</strong></div>
                </div>
                <div className="current-salary">
                  <div><span>CURRENT ANNUAL BASE</span><strong>{formatMoney(selectedEmployee.base_salary, selectedEmployee.currency)}</strong></div>
                  <div className="current-salary-meta"><span>{selectedEmployee.currency} <i>·</i> Effective {selectedEmployee.salary_effective_date}</span><button className="edit-button" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit salary</button></div>
                </div>
                <div className="history-section">
                  <div className="history-heading"><span>Salary history</span><span>{selectedEmployee.salary_history.length} {selectedEmployee.salary_history.length === 1 ? "record" : "records"}</span></div>
                  <div className="history-list">
                    {selectedEmployee.salary_history.map((record, index) => <div className="history-item" key={record.id}>
                      <span className={`history-marker ${index === 0 ? "history-marker-current" : ""}`} />
                      <div className="history-copy"><strong>{formatMoney(record.new_salary, record.new_currency)}</strong><span>{record.previous_salary == null ? "Initial salary record" : `Previous: ${formatMoney(record.previous_salary, record.previous_currency)}`}</span></div>
                      <div className="history-date"><strong>{record.effective_date}</strong><span>{record.actor}</span></div>
                    </div>)}
                  </div>
                </div>
                <div className="modal-actions"><button className="secondary-button" onClick={closeModal}>Done</button><button className="primary-button" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit salary</button></div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SortMark({ active, direction }) {
  return <span className={`sort-mark ${active ? "sort-active" : ""}`}>{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>;
}

function currencySymbol(currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
    .formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

function countryMark(country) {
  const marks = {
    "United States": "US", "United Kingdom": "UK", India: "IN", Germany: "DE",
    France: "FR", Canada: "CA", Australia: "AU", Japan: "JP", Singapore: "SG", Mexico: "MX",
  };
  return marks[country] ?? "•";
}

export default App;
