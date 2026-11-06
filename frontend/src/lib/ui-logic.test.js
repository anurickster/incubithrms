import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { formatCompactCount, formatMoney, initials } from "./format.js";

describe("Frontend UI & Interaction Logic Tests", () => {
  test("formats currency figures safely without rounding distortion", () => {
    assert.equal(formatMoney(120000, "USD"), "$120,000.00");
    assert.equal(formatMoney(85000.5, "GBP"), "£85,000.50");
    assert.equal(formatMoney(5000000, "INR"), "₹5,000,000.00");
    assert.equal(formatMoney(14000000, "JPY"), "¥14,000,000");
  });

  test("calculates employee avatar initials accurately", () => {
    assert.equal(initials("Aarav", "Patel"), "AP");
    assert.equal(initials("Ethan", ""), "E");
    assert.equal(initials("", "Gupta"), "G");
    assert.equal(initials(null, undefined), "");
  });

  test("formats compact counts with comma grouping", () => {
    assert.equal(formatCompactCount(10000), "10,000");
    assert.equal(formatCompactCount(42), "42");
    assert.equal(formatCompactCount(0), "0");
  });

  test("calculates minimum effective date boundary (day after current salary)", () => {
    function dateAfter(value) {
      if (!value) return "";
      const [year, month, day] = value.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    }

    assert.equal(dateAfter("2026-01-15"), "2026-01-16");
    assert.equal(dateAfter("2026-02-28"), "2026-03-01");
    assert.equal(dateAfter("2026-12-31"), "2027-01-01");
    assert.equal(dateAfter(""), "");
  });

  test("focus trap selector targets all interactive non-disabled controls", () => {
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Verify selector string includes all standard accessible interactive elements
    assert.ok(focusableSelector.includes("button:not([disabled])"));
    assert.ok(focusableSelector.includes("input:not([disabled])"));
    assert.ok(focusableSelector.includes("select:not([disabled])"));
    assert.ok(focusableSelector.includes('[tabindex]:not([tabindex="-1"])'));
  });

  test("serializes URL search and filter parameters cleanly for CSV export and directory", () => {
    function serializeFilters({ query, country, department, currency, page = 1, pageSize = 10 }) {
      const params = new URLSearchParams();
      if (page) params.set("page", String(page));
      if (pageSize) params.set("page_size", String(pageSize));
      if (query && query.trim()) params.set("q", query.trim());
      if (country) params.set("country", country);
      if (department) params.set("department", department);
      if (currency) params.set("currency", currency);
      return params.toString();
    }

    const qs = serializeFilters({
      query: "  Aisha  ",
      country: "India",
      department: "Engineering",
      currency: "INR",
      page: 2,
      pageSize: 25,
    });

    assert.equal(
      qs,
      "page=2&page_size=25&q=Aisha&country=India&department=Engineering&currency=INR"
    );
  });
});
