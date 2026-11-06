export function dateAfter(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

// Salary effective dates use UTC in both the browser and API.
export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
