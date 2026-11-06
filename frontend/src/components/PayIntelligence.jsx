import { useEffect, useState } from "react";
import { request } from "../lib/api.js";
import { formatCompactCount, formatMoney } from "../lib/format.js";
import { Icon } from "./Icons.jsx";

export function PayIntelligence({
  stats,
  onNavigateToDirectory,
  activeQuestion: controlledQuestion,
  onQuestionChange,
  selectedDept: controlledDept,
  onDeptChange,
  cohortCountry,
  onCohortCountryChange,
  cohortDepartment,
  onCohortDepartmentChange,
}) {
  const [internalQuestion, setInternalQuestion] = useState("bands");
  const [internalDept, setInternalDept] = useState("Engineering");
  const [cohortResult, setCohortResult] = useState(null);
  const [cohortError, setCohortError] = useState("");
  const [retry, setRetry] = useState(0);

  const activeQuestion = controlledQuestion !== undefined ? controlledQuestion : internalQuestion;
  const setActiveQuestion = onQuestionChange || setInternalQuestion;

  const selectedDept = controlledDept !== undefined ? controlledDept : internalDept;
  const setSelectedDept = onDeptChange || setInternalDept;

  const currencies = stats?.currencies ?? [];
  const departments = stats?.departments ?? [];
  const countries = stats?.countries ?? [];
  const payBands = stats?.pay_bands_by_title ?? [];

  // Filter pay bands by department
  const filteredBands = payBands.filter((b) => !selectedDept || b.department === selectedDept);

  // Selected cohort statistics
  const cohortCountryStats = (stats?.compensation_by_country ?? []).filter(
    (c) => c.country === cohortCountry
  );
  const cohortKey = JSON.stringify([cohortCountry, cohortDepartment]);
  const cohortStats = cohortResult?.key === cohortKey ? cohortResult.stats : null;

  useEffect(() => {
    if (activeQuestion !== "cohort") return;
    const controller = new AbortController();
    setCohortError("");
    const params = new URLSearchParams({ country: cohortCountry, department: cohortDepartment });
    request(`/api/stats?${params}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setCohortResult({ key: cohortKey, stats: result });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setCohortError(cause.message);
      });
    return () => controller.abort();
  }, [activeQuestion, cohortCountry, cohortDepartment, cohortKey, retry, stats]);

  return (
    <div className="pay-intelligence">
      <div className="intelligence-header card">
        <div className="intelligence-intro">
          <div className="section-title">
            <Icon name="sparkles" size={18} className="sparkle-icon" /> How ACME Pays People — Compensation Intelligence
          </div>
          <div className="section-subtitle">
            Currency-safe salary distributions and country and department benchmarks across 10,000 employees.
          </div>
        </div>

        <div className="question-pills" role="tablist" aria-label="Compensation questions">
          <button
            role="tab"
            aria-selected={activeQuestion === "bands"}
            className={`question-pill ${activeQuestion === "bands" ? "active" : ""}`}
            onClick={() => setActiveQuestion("bands")}
          >
            Salary Ranges by Role
          </button>
          <button
            role="tab"
            aria-selected={activeQuestion === "percentiles"}
            className={`question-pill ${activeQuestion === "percentiles" ? "active" : ""}`}
            onClick={() => setActiveQuestion("percentiles")}
          >
            Percentile Spread &amp; Dispersion
          </button>
          <button
            role="tab"
            aria-selected={activeQuestion === "cohort"}
            className={`question-pill ${activeQuestion === "cohort" ? "active" : ""}`}
            onClick={() => setActiveQuestion("cohort")}
          >
            Cohort Cross-Explorer
          </button>
        </div>
      </div>

      {activeQuestion === "bands" && (
        <section className="card intelligence-section">
          <div className="card-heading">
            <div>
              <div className="section-title">Salary Ranges by Job Title</div>
              <div className="section-subtitle">
                Explore observed minimum, median, and maximum annual salaries by role and currency. These are not approved compensation bands.
              </div>
            </div>
            <div className="filter-group">
              <label htmlFor="dept-select" className="filter-label">Filter Department:</label>
              <select
                id="dept-select"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="select-input"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.department} value={d.department}>
                    {d.department} ({formatCompactCount(d.headcount)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pay-band-grid">
            {filteredBands.map((band) => {
              const spread = band.max_salary - band.min_salary;
              const medianPercent = spread > 0
                ? Math.min(100, Math.max(0, ((band.median_salary - band.min_salary) / spread) * 100))
                : 50;

              return (
                <article key={`${band.department}-${band.job_title}-${band.currency}`} className="pay-band-card">
                  <div className="band-top">
                    <div>
                      <span className="band-dept">{band.department}</span>
                      <h3 className="band-title">{band.job_title}</h3>
                    </div>
                    <span className="currency-tag">{band.currency}</span>
                  </div>

                  <div className="band-metrics">
                    <div className="band-metric-item">
                      <span className="metric-label">MIN</span>
                      <strong className="metric-val">{formatMoney(band.min_salary, band.currency)}</strong>
                    </div>
                    <div className="band-metric-item highlight">
                      <span className="metric-label">MEDIAN</span>
                      <strong className="metric-val">{formatMoney(band.median_salary, band.currency)}</strong>
                    </div>
                    <div className="band-metric-item">
                      <span className="metric-label">MAX</span>
                      <strong className="metric-val">{formatMoney(band.max_salary, band.currency)}</strong>
                    </div>
                  </div>

                  <div className="range-track">
                    <div className="range-fill" style={{ width: "100%" }} />
                    <div className="range-median-marker" style={{ left: `${medianPercent}%` }} title={`Median: ${formatMoney(band.median_salary, band.currency)}`} />
                  </div>

                  <div className="band-footer">
                    <span>Sample size: {formatCompactCount(band.headcount)} employees</span>
                    <span>Average: {formatMoney(band.average_salary, band.currency)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeQuestion === "percentiles" && (
        <section className="card intelligence-section">
          <div className="card-heading">
            <div>
              <div className="section-title">Percentile Distribution &amp; Pay Dispersion</div>
              <div className="section-subtitle">
                Analysis of P25 (bottom quartile), Median (P50), P75 (top quartile), and pay dispersion ratio (Max / Min) by currency.
              </div>
            </div>
            <span className="period-tag">FULL WORKFORCE</span>
          </div>

          <div className="percentile-table-wrap">
            <table className="percentile-table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Headcount</th>
                  <th>Min Pay</th>
                  <th>P25 (25th)</th>
                  <th>Median (P50)</th>
                  <th>P75 (75th)</th>
                  <th>Max Pay</th>
                  <th>Dispersion (Max/Min)</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((curr) => (
                  <tr key={curr.currency}>
                    <td>
                      <span className="currency-badge">{curr.currency}</span>
                    </td>
                    <td>{formatCompactCount(curr.headcount)}</td>
                    <td className="mono-cell">{formatMoney(curr.min_salary, curr.currency)}</td>
                    <td className="mono-cell quartile-cell">{formatMoney(curr.p25_salary, curr.currency)}</td>
                    <td className="mono-cell median-cell">{formatMoney(curr.median_salary, curr.currency)}</td>
                    <td className="mono-cell quartile-cell">{formatMoney(curr.p75_salary, curr.currency)}</td>
                    <td className="mono-cell">{formatMoney(curr.max_salary, curr.currency)}</td>
                    <td>
                      <span className={`dispersion-badge ${curr.spread_ratio > 4.5 ? "high" : "normal"}`}>
                        {curr.spread_ratio}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pay-footnote">
            <Icon name="shield" size={15} />
            <span>
              Statistics stay within each currency. Max/Min measures salary dispersion; it does not establish pay equity across roles or seniority. IQR = P75 − P25.
            </span>
          </div>
        </section>
      )}

      {activeQuestion === "cohort" && (
        <section className="card intelligence-section">
          <div className="card-heading">
            <div>
              <div className="section-title">Cohort Cross-Comparison</div>
              <div className="section-subtitle">
                Select any country and department to view localized compensation benchmarks and immediately drill into employee records.
              </div>
            </div>
          </div>

          <div className="cohort-controls-bar">
            <div className="control-item">
              <label htmlFor="cohort-country">Operating Country</label>
              <select id="cohort-country" value={cohortCountry} onChange={(e) => onCohortCountryChange(e.target.value)}>
                {countries.map((c) => (
                  <option key={c.country} value={c.country}>
                    {c.country}
                  </option>
                ))}
              </select>
            </div>
            <div className="control-item">
              <label htmlFor="cohort-department">Department</label>
              <select id="cohort-department" value={cohortDepartment} onChange={(e) => onCohortDepartmentChange(e.target.value)}>
                {departments.map((d) => (
                  <option key={d.department} value={d.department}>
                    {d.department}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {cohortError && (
            <div role="alert" className="alert alert-error">
              {cohortError}
              <button className="text-button" onClick={() => setRetry((value) => value + 1)}>Retry cohort</button>
            </div>
          )}

          <div className="cohort-summary-grid">
            <div className="cohort-stat-card">
              <span className="stat-caption">COUNTRY BENCHMARK ({cohortCountry})</span>
              {cohortCountryStats.map((group) => (
                <div key={group.currency}>
                  <div className="stat-value">{formatMoney(group.median_salary, group.currency)}</div>
                  <div className="stat-label">Country median ({group.currency}, all departments)</div>
                  <div className="stat-foot">
                    <span>Avg: {formatMoney(group.average_salary, group.currency)}</span>
                    <span>Headcount: {formatCompactCount(group.headcount)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="cohort-stat-card" aria-busy={!cohortStats && !cohortError}>
              <span className="stat-caption">{cohortDepartment.toUpperCase()} IN {cohortCountry.toUpperCase()}</span>
              {!cohortStats && !cohortError && <p role="status">Loading cohort…</p>}
              {cohortStats?.currencies.map((group) => (
                <div key={group.currency}>
                  <div className="stat-value">{formatMoney(group.median_salary, group.currency)}</div>
                  <div className="stat-label">Selected cohort median ({group.currency})</div>
                  <div className="stat-foot"><span>Avg: {formatMoney(group.average_salary, group.currency)}</span></div>
                </div>
              ))}
              {cohortStats && <div className="stat-foot" data-testid="cohort-count">Cohort count: {formatCompactCount(cohortStats.employee_count)}</div>}
              {cohortStats?.employee_count === 0 && <p>No employees match this country and department.</p>}
            </div>

            <div className="cohort-stat-card action-card">
              <span className="stat-caption">DIRECTORY ACTION</span>
              <div className="cohort-action-desc">
                View all team members in <strong>{cohortDepartment}</strong> located in <strong>{cohortCountry}</strong>.
              </div>
              <button
                className="primary-button cohort-button"
                onClick={() => onNavigateToDirectory({ country: cohortCountry, department: cohortDepartment })}
              >
                <Icon name="people" size={16} /> Open Cohort in Directory
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
