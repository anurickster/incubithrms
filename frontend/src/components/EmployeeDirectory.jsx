import { useState } from "react";
import { formatCompactCount, formatMoney, initials } from "../lib/format.js";
import { Icon } from "./Icons.jsx";

export function EmployeeDirectory({
  employees,
  page,
  pageSize,
  queryInput,
  setQueryInput,
  country,
  setCountry,
  department,
  setDepartment,
  currency,
  setCurrency,
  sort,
  direction,
  onSort,
  onPageChange,
  directoryLoading,
  onSelectEmployee,
  stats,
  isOverviewSnippet = false,
  onViewAll,
}) {
  const [exporting, setExporting] = useState(false);

  const hasFilters = Boolean(queryInput || country || department || currency);

  function clearAllFilters() {
    setQueryInput("");
    setCountry("");
    setDepartment("");
    setCurrency("");
    onPageChange(1);
  }

  function handleExportCsv() {
    setExporting(true);
    const params = new URLSearchParams();
    if (queryInput) params.set("q", queryInput.trim());
    if (country) params.set("country", country);
    if (department) params.set("department", department);
    if (currency) params.set("currency", currency);

    const exportUrl = `/api/employees/export?${params.toString()}`;
    const link = document.createElement("a");
    link.href = exportUrl;
    link.setAttribute("download", "acme-employees.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setExporting(false), 800);
  }

  return (
    <section className="card directory-card">
      <div className="table-heading">
        <div>
          <div className="section-title">
            {isOverviewSnippet ? "Recently added" : "Employee directory"}
          </div>
          <div className="section-subtitle">
            {formatCompactCount(employees.total)} team members
            {isOverviewSnippet && <span className="heading-dot">·</span>}
            {isOverviewSnippet && (
              <span className="live-hint">
                <span className="live-dot" /> Live data
              </span>
            )}
          </div>
        </div>

        {isOverviewSnippet ? (
          <button className="text-button" onClick={onViewAll}>
            View directory <Icon name="chevron" size={16} />
          </button>
        ) : (
          <div className="table-actions-right">
            <button
              className="secondary-button export-button"
              onClick={handleExportCsv}
              disabled={exporting || employees.total === 0}
              title="Download filtered records as CSV"
            >
              <Icon name="download" size={15} />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <div className="result-count">
              Showing {employees.total ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, employees.total)} of{" "}
              {formatCompactCount(employees.total)}
            </div>
          </div>
        )}
      </div>

      {!isOverviewSnippet && (
        <div className="filters">
          <label className="search-field">
            <Icon name="search" size={18} />
            <input
              aria-label="Search employees"
              placeholder="Search name, email or ID"
              value={queryInput}
              onChange={(e) => {
                setQueryInput(e.target.value);
                onPageChange(1);
              }}
            />
            {queryInput && (
              <button
                className="clear-search"
                onClick={() => {
                  setQueryInput("");
                  onPageChange(1);
                }}
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </label>

          <select
            aria-label="Filter by country"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              onPageChange(1);
            }}
          >
            <option value="">All countries</option>
            {stats?.countries.map((row) => (
              <option key={row.country} value={row.country}>
                {row.country}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by department"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              onPageChange(1);
            }}
          >
            <option value="">All departments</option>
            {stats?.departments.map((row) => (
              <option key={row.department} value={row.department}>
                {row.department}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              onPageChange(1);
            }}
          >
            <option value="">All currencies</option>
            {stats?.currencies.map((row) => (
              <option key={row.currency} value={row.currency}>
                {row.currency}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button className="text-button clear-filters-btn" onClick={clearAllFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <button onClick={() => onSort("employee_id")}>
                  Employee{" "}
                  <SortMark active={sort === "employee_id"} direction={direction} />
                </button>
              </th>
              <th>Department</th>
              <th>Location</th>
              <th>
                <button onClick={() => onSort("base_salary")}>
                  Base salary{" "}
                  <SortMark active={sort === "base_salary"} direction={direction} />
                </button>
              </th>
              <th>Effective from</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {directoryLoading && employees.employees.length === 0 ? (
              <TableSkeletonRows count={isOverviewSnippet ? 5 : 8} />
            ) : employees.employees.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">
                    <span className="empty-icon">
                      <Icon name="search" size={22} />
                    </span>
                    <strong>No employees found</strong>
                    <span>Try adjusting your search or filters.</span>
                    <button className="text-button" onClick={clearAllFilters}>
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              employees.employees.map((employee) => (
                <tr
                  className="employee-row"
                  key={employee.employee_id}
                  onClick={() => onSelectEmployee(employee)}
                >
                  <td>
                    <div className="employee-cell">
                      <Avatar
                        firstName={employee.first_name}
                        lastName={employee.last_name}
                        small
                      />
                      <div className="employee-identity">
                        <span className="employee-name">
                          {employee.first_name} {employee.last_name}
                        </span>
                        <span className="employee-id">{employee.employee_id}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="department-cell">
                      <span
                        className={`department-mark department-${employee.department
                          .toLowerCase()
                          .replace(/[^a-z]+/g, "-")}`}
                      />
                      {employee.department}
                    </div>
                  </td>
                  <td>
                    <div className="location-cell">
                      <Icon name="globe" size={15} />
                      {employee.country}
                    </div>
                  </td>
                  <td>
                    <span className="salary-value">
                      {formatMoney(employee.base_salary, employee.currency)}
                    </span>
                    <span className="currency-tag">{employee.currency}</span>
                  </td>
                  <td>
                    <span className="date-cell">
                      {employee.salary_effective_date}
                    </span>
                  </td>
                  <td>
                    <button
                      className="row-action"
                      aria-label={`View ${employee.first_name} ${employee.last_name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEmployee(employee);
                      }}
                    >
                      <Icon name="chevron" size={17} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isOverviewSnippet && (
        <div className="pagination">
          <span>
            Page {employees.pages ? page : 0} of {employees.pages || 0}
          </span>
          <div className="pagination-actions">
            <button
              disabled={page <= 1 || directoryLoading}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </button>
            <button
              disabled={page >= employees.pages || directoryLoading}
              onClick={() => onPageChange(page + 1)}
            >
              Next <Icon name="chevron" size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function TableSkeletonRows({ count = 5 }) {
  return Array.from({ length: count }).map((_, index) => (
    <tr key={`skeleton-${index}`} className="skeleton-row" aria-hidden="true">
      <td>
        <div className="employee-cell">
          <div className="skeleton skeleton-circle shimmer" />
          <div className="employee-identity">
            <div
              className="skeleton skeleton-line shimmer"
              style={{ width: "125px", height: "13px", marginBottom: "4px" }}
            />
            <div
              className="skeleton skeleton-line shimmer"
              style={{ width: "75px", height: "10px" }}
            />
          </div>
        </div>
      </td>
      <td>
        <div
          className="skeleton skeleton-pill shimmer"
          style={{ width: "95px", height: "22px", borderRadius: "12px" }}
        />
      </td>
      <td>
        <div
          className="skeleton skeleton-line shimmer"
          style={{ width: "105px", height: "13px" }}
        />
      </td>
      <td>
        <div
          className="skeleton skeleton-line shimmer"
          style={{ width: "85px", height: "14px" }}
        />
      </td>
      <td>
        <div
          className="skeleton skeleton-line shimmer"
          style={{ width: "75px", height: "12px" }}
        />
      </td>
      <td>
        <div
          className="skeleton skeleton-action shimmer"
          style={{ width: "24px", height: "24px", borderRadius: "50%" }}
        />
      </td>
    </tr>
  ));
}

function SortMark({ active, direction }) {
  return (
    <span className={`sort-mark ${active ? "sort-active" : ""}`}>
      {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );
}

export function Avatar({ firstName, lastName, small = false }) {
  const colors = ["lavender", "mint", "peach", "blue", "rose"];
  const color =
    colors[
      ((firstName?.charCodeAt(0) ?? 0) + (lastName?.charCodeAt(0) ?? 0)) %
        colors.length
    ];
  return (
    <span className={`avatar ${small ? "avatar-small" : ""} avatar-${color}`}>
      {initials(firstName, lastName)}
    </span>
  );
}
