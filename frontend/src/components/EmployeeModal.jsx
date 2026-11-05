import { useState } from "react";
import { formatMoney } from "../lib/format.js";
import { Avatar } from "./EmployeeDirectory.jsx";
import { Icon } from "./Icons.jsx";

export function EmployeeModal({
  selectedEmployee,
  modalLoading,
  onClose,
  onSaveSalary,
  visibleCurrencies,
  saving,
}) {
  const [editing, setEditing] = useState(false);

  if (!selectedEmployee) return null;

  function dateAfter(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  }

  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
  }

  const minimumEffectiveDate = dateAfter(selectedEmployee.salary_effective_date);
  const salaryChangeUnavailable = minimumEffectiveDate > localToday();
  const defaultEffectiveDate = salaryChangeUnavailable
    ? localToday()
    : [localToday(), minimumEffectiveDate].sort().at(-1);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const success = await onSaveSalary({
      base_salary: form.get("base_salary"),
      currency: form.get("currency"),
      effective_date: form.get("effective_date"),
    });
    if (success) {
      setEditing(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        className="employee-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-top">
          <span className="modal-kicker">
            {editing ? "UPDATE COMPENSATION" : "EMPLOYEE PROFILE"}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>

        <div className="modal-person">
          <Avatar
            firstName={selectedEmployee.first_name}
            lastName={selectedEmployee.last_name}
          />
          <div>
            <h2 id="modal-title">
              {selectedEmployee.first_name} {selectedEmployee.last_name}
            </h2>
            <span>
              {selectedEmployee.job_title} <span className="person-dot">·</span>{" "}
              {selectedEmployee.department}
            </span>
          </div>
        </div>

        {modalLoading ? (
          <div className="modal-loading">Loading profile…</div>
        ) : editing ? (
          <form className="salary-form" onSubmit={handleSubmit}>
            <div className="form-section-label">
              SALARY DETAILS <span>Only current base salary is editable</span>
            </div>

            <label>
              Annual base salary
              <div className="input-prefix">
                <span>{currencySymbol(selectedEmployee.currency)}</span>
                <input
                  name="base_salary"
                  type="number"
                  min="0.01"
                  max="1000000000"
                  step="0.01"
                  defaultValue={selectedEmployee.base_salary}
                  required
                  autoFocus
                />
              </div>
            </label>

            <div className="form-row">
              <label>
                Currency
                <select name="currency" defaultValue={selectedEmployee.currency}>
                  {(visibleCurrencies.some((i) => i.currency === selectedEmployee.currency)
                    ? visibleCurrencies
                    : [...visibleCurrencies, { currency: selectedEmployee.currency }]
                  ).map((item) => (
                    <option key={item.currency} value={item.currency}>
                      {item.currency}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Effective date
                <input
                  name="effective_date"
                  type="date"
                  min={minimumEffectiveDate}
                  max={localToday()}
                  defaultValue={defaultEffectiveDate}
                  required
                  disabled={salaryChangeUnavailable}
                />
              </label>
            </div>

            <div className="form-note">
              <Icon name="clock" size={15} />
              <span>
                {salaryChangeUnavailable
                  ? "A salary change is already recorded for today. Another change can be made tomorrow."
                  : "Changes are recorded in salary history and take effect on the selected date. Future-dated changes are not supported."}
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving || salaryChangeUnavailable}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="profile-details-grid">
              <div>
                <span>EMPLOYEE ID</span>
                <strong>{selectedEmployee.employee_id}</strong>
              </div>
              <div>
                <span>LOCATION</span>
                <strong>
                  {countryMark(selectedEmployee.country)} {selectedEmployee.country}
                </strong>
              </div>
              <div>
                <span>EMAIL</span>
                <strong className="profile-email">{selectedEmployee.email}</strong>
              </div>
              <div>
                <span>HIRE DATE</span>
                <strong>{selectedEmployee.hire_date}</strong>
              </div>
            </div>

            <div className="current-salary">
              <div>
                <span>CURRENT ANNUAL BASE</span>
                <strong>
                  {formatMoney(selectedEmployee.base_salary, selectedEmployee.currency)}
                </strong>
              </div>
              <div className="current-salary-meta">
                <span>
                  {selectedEmployee.currency} <i>·</i> Effective{" "}
                  {selectedEmployee.salary_effective_date}
                </span>
                <button className="edit-button" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={15} /> Edit salary
                </button>
              </div>
            </div>

            <div className="history-section">
              <div className="history-heading">
                <span>Salary history</span>
                <span>
                  {selectedEmployee.salary_history?.length || 0}{" "}
                  {selectedEmployee.salary_history?.length === 1 ? "record" : "records"}
                </span>
              </div>
              <div className="history-list">
                {selectedEmployee.salary_history?.map((record, index) => (
                  <div className="history-item" key={record.id}>
                    <span
                      className={`history-marker ${
                        index === 0 ? "history-marker-current" : ""
                      }`}
                    />
                    <div className="history-copy">
                      <strong>
                        {formatMoney(record.new_salary, record.new_currency)}
                      </strong>
                      <span>
                        {record.previous_salary == null
                          ? "Initial salary record"
                          : `Previous: ${formatMoney(
                              record.previous_salary,
                              record.previous_currency
                            )}`}
                      </span>
                    </div>
                    <div className="history-date">
                      <strong>{record.effective_date}</strong>
                      <span>{record.actor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={onClose}>
                Done
              </button>
              <button className="primary-button" onClick={() => setEditing(true)}>
                <Icon name="edit" size={16} /> Edit salary
              </button>
            </div>
          </>
        )}
      </section>
    </div>
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
