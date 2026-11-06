import { useMemo, useState } from "react";
import { formatCompactCount, formatMoney } from "../lib/format.js";
import { Icon } from "./Icons.jsx";

export function Overview({
  stats,
  onNavigateToTab,
  onFilterCountry,
  childrenSnippetTable,
}) {
  const [breakdownType, setBreakdownType] = useState("country");
  const [breakdownSelection, setBreakdownSelection] = useState("");

  const visibleCurrencies = useMemo(() => stats?.currencies ?? [], [stats]);
  const maxCountryCount = Math.max(...(stats?.countries?.map((row) => row.headcount) ?? [1]), 1);

  const breakdownField = breakdownType === "country" ? "country" : "department";
  const breakdownOptions = stats?.[breakdownType === "country" ? "countries" : "departments"] ?? [];
  const selectedBreakdown =
    breakdownOptions.find((row) => row[breakdownField] === breakdownSelection) ??
    breakdownOptions[0];

  const compensationRows = (
    stats?.[
      breakdownType === "country" ? "compensation_by_country" : "compensation_by_department"
    ] ?? []
  ).filter((row) => row[breakdownField] === selectedBreakdown?.[breakdownField]);

  return (
    <>
      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-indigo">
              <Icon name="people" size={19} />
            </span>
            <span className="stat-caption">ACROSS THE ORG</span>
          </div>
          <div className="stat-value">{formatCompactCount(stats?.employee_count ?? 0)}</div>
          <div className="stat-label">Total employees</div>
          <div className="stat-foot">
            <span className="foot-indicator">
              <span className="live-dot" /> Active workforce
            </span>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-blue">
              <Icon name="globe" size={19} />
            </span>
            <span className="stat-caption">GLOBAL REACH</span>
          </div>
          <div className="stat-value">
            {String(stats?.country_count ?? 0).padStart(2, "0")} <span className="stat-unit">countries</span>
          </div>
          <div className="stat-label">Where we work</div>
          <div className="stat-foot">
            <span className="flag-cluster">
              {stats?.countries.slice(0, 5).map((row) => (
                <span key={row.country} title={row.country}>
                  {countryMark(row.country)}
                </span>
              ))}
            </span>
            <span className="foot-note">Across 5 global regions</span>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon stat-icon-green">
              <Icon name="overview" size={19} />
            </span>
            <span className="stat-caption">ORGANIZATION</span>
          </div>
          <div className="stat-value">
            {String(stats?.department_count ?? 0).padStart(2, "0")} <span className="stat-unit">teams</span>
          </div>
          <div className="stat-label">Distinct departments</div>
          <div className="stat-foot">
            <span className="department-foot-mark">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="foot-note">Standardized role titles</span>
          </div>
        </article>
      </div>

      <div className="banner-card card">
        <div className="banner-content">
          <div className="banner-badge">
            <Icon name="sparkles" size={14} /> NEW COMPENSATION INTELLIGENCE
          </div>
          <h3>Answer questions on how ACME pays its workforce</h3>
          <p>
            Explore role salary ranges, 25th–75th percentile distributions, and country and department benchmarks without spreadsheet formulas.
          </p>
        </div>
        <button
          className="primary-button banner-cta"
          onClick={() => onNavigateToTab("analytics")}
        >
          <Icon name="chart" size={16} /> Open Pay Intelligence
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="card pay-card">
          <div className="card-heading">
            <div>
              <div className="section-title">Salary benchmarks</div>
              <div className="section-subtitle">
                Averages by currency{" "}
                <span
                  className="info-dot"
                  title="Salaries are grouped by currency and never converted or added across currencies."
                >
                  i
                </span>
              </div>
            </div>
            <span className="period-tag">CURRENT BASE SALARY</span>
          </div>
          <div className="currency-list">
            {visibleCurrencies.map((row, index) => {
              const colors = [
                "#7268e7", "#21a67a", "#e7a13a", "#5a9ae6", "#dd7897",
                "#34a7ad", "#9772d5", "#da7962", "#68a774", "#c27caa",
              ];
              const maxHeadcount = Math.max(...visibleCurrencies.map((item) => item.headcount), 1);
              const progressWidth = Math.min(100, Math.max(12, (row.headcount / maxHeadcount) * 100));

              return (
                <div className="currency-row" key={row.currency}>
                  <span
                    className="currency-symbol"
                    style={{ "--currency-color": colors[index % colors.length] }}
                  >
                    {currencySymbol(row.currency)}
                  </span>
                  <span className="currency-code">{row.currency}</span>
                  <span className="currency-progress">
                    <span
                      style={{
                        width: `${progressWidth}%`,
                        background: colors[index % colors.length],
                      }}
                    />
                  </span>
                  <span className="currency-average">
                    {formatMoney(row.average_salary, row.currency)}
                    <small>avg</small>
                  </span>
                  <span className="currency-headcount">
                    {formatCompactCount(row.headcount)} <small>people</small>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pay-footnote">
            <Icon name="shield" size={15} />
            <span>Benchmarks are calculated within each currency group. No FX conversion applied.</span>
          </div>
        </section>

        <section className="card countries-card">
          <div className="card-heading">
            <div>
              <div className="section-title">Where we work</div>
              <div className="section-subtitle">Team distribution by country</div>
            </div>
            <span className="round-icon">
              <Icon name="globe" size={16} />
            </span>
          </div>
          <div className="country-list">
            {stats?.countries.slice(0, 6).map((row) => (
              <div
                className="country-row clickable"
                key={row.country}
                onClick={() => onFilterCountry(row.country)}
                title={`Filter directory for ${row.country}`}
              >
                <span className="country-flag">{countryMark(row.country)}</span>
                <span className="country-name">{row.country}</span>
                <span className="country-bar">
                  <span
                    style={{
                      width: `${Math.max(3, (row.headcount / maxCountryCount) * 100)}%`,
                    }}
                  />
                </span>
                <span className="country-count">{formatCompactCount(row.headcount)}</span>
              </div>
            ))}
          </div>
          <button
            className="country-link"
            onClick={() => onNavigateToTab("employees")}
          >
            View all countries in directory <Icon name="arrow" size={14} />
          </button>
        </section>
      </div>

      <section className="card compensation-card">
        <div className="card-heading">
          <div>
            <div className="section-title">Pay breakdown</div>
            <div className="section-subtitle">Compare salary benchmarks without blending currencies</div>
          </div>
          <div className="breakdown-controls">
            <div className="breakdown-tabs" role="tablist" aria-label="Compensation breakdown">
              <button
                role="tab"
                aria-selected={breakdownType === "country"}
                className={breakdownType === "country" ? "selected" : ""}
                onClick={() => {
                  setBreakdownType("country");
                  setBreakdownSelection("");
                }}
              >
                Country
              </button>
              <button
                role="tab"
                aria-selected={breakdownType === "department"}
                className={breakdownType === "department" ? "selected" : ""}
                onClick={() => {
                  setBreakdownType("department");
                  setBreakdownSelection("");
                }}
              >
                Department
              </button>
            </div>
            <select
              aria-label={`Select ${breakdownType}`}
              value={selectedBreakdown?.[breakdownField] ?? ""}
              onChange={(e) => setBreakdownSelection(e.target.value)}
            >
              {breakdownOptions.map((row) => (
                <option key={row[breakdownField]} value={row[breakdownField]}>
                  {row[breakdownField]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="salary-breakdown-grid">
          {compensationRows.map((row) => (
            <article
              className="salary-breakdown-item"
              key={`${row[breakdownField]}-${row.currency}`}
            >
              <div className="breakdown-currency">
                <span className="currency-symbol">{currencySymbol(row.currency)}</span>
                <strong>{row.currency}</strong>
                <span>{formatCompactCount(row.headcount)} people</span>
              </div>
              <div className="breakdown-metrics">
                <div>
                  <span>AVERAGE</span>
                  <strong>{formatMoney(row.average_salary, row.currency)}</strong>
                </div>
                <div>
                  <span>MEDIAN</span>
                  <strong>{formatMoney(row.median_salary, row.currency)}</strong>
                </div>
              </div>
            </article>
          ))}
          {compensationRows.length === 0 && (
            <span className="breakdown-empty">No salary data for this selection yet.</span>
          )}
        </div>
        <div className="breakdown-footnote">
          <Icon name="shield" size={14} /> Each benchmark is calculated only among employees paid in the same currency.
        </div>
      </section>

      {childrenSnippetTable}
    </>
  );
}

function currencySymbol(currency) {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

function countryMark(country) {
  const marks = {
    "United States": "US",
    "United Kingdom": "UK",
    India: "IN",
    Germany: "DE",
    France: "FR",
    Canada: "CA",
    Australia: "AU",
    Japan: "JP",
    Singapore: "SG",
    Mexico: "MX",
  };
  return marks[country] ?? "•";
}

