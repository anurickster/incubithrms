import assert from "node:assert/strict";
import test from "node:test";
import { formatCompactCount, formatMoney, initials } from "./format.js";

test("formats currencies without combining or dropping fractional amounts", () => {
  assert.equal(formatMoney(92500.5, "USD"), "$92,500.50");
  assert.equal(formatMoney(92500, "JPY"), "¥92,500");
});

test("formats employee counts and initials", () => {
  assert.equal(formatCompactCount(10_000), "10,000");
  assert.equal(initials("Aisha", "Khan"), "AK");
  assert.equal(initials("", "Khan"), "K");
});
