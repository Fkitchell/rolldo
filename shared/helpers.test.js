import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { compareDueDates, daysUntilDue, formatDue, urgencyMultiplier } from "./dueDates.js";
import { formatMinutes, formatRecurrence } from "./format.js";
import { weightedPick } from "./pick.js";

afterEach(() => mock.timers.reset());

test("daysUntilDue / formatDue count calendar days from today", () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 27, 22).getTime() });
  assert.equal(daysUntilDue("2026-10-25"), -2);
  assert.equal(formatDue("2026-10-25").label, "Overdue 2d");
  assert.equal(formatDue("2026-10-27").label, "Due today");
  assert.equal(formatDue("2026-10-28").label, "Due tomorrow");
  assert.equal(formatDue("2026-10-30").tone, "soon");
  assert.equal(formatDue(null), null);
  assert.equal(daysUntilDue("not-a-date"), null);
  assert.equal(urgencyMultiplier({ dueDate: "2026-10-20" }), 2);
  assert.equal(urgencyMultiplier({ dueDate: null }), 1);
});

test("compareDueDates sorts earliest first and undated last", () => {
  const sorted = [{ dueDate: null }, { dueDate: "2026-11-01" }, { dueDate: "2026-10-01" }].sort(compareDueDates);
  assert.deepEqual(
    sorted.map((t) => t.dueDate),
    ["2026-10-01", "2026-11-01", null],
  );
});

test("formatMinutes and formatRecurrence", () => {
  assert.equal(formatMinutes(null), null);
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(120), "2h");
  assert.equal(formatMinutes(90), "1h 30m");
  assert.equal(formatRecurrence({ frequency: "weekly", interval: 1 }), "Weekly");
  assert.equal(formatRecurrence({ frequency: "monthly", interval: 3 }), "Every 3 months");
});

test("weightedPick favours high priority over low", () => {
  const pool = [
    { id: "high", priority: "high", dueDate: null },
    { id: "low", priority: "low", dueDate: null },
  ];
  const values = [0.1, 0.59, 0.61, 0.99];
  let i = 0;
  mock.method(Math, "random", () => values[i++]);
  // Total weight 2.5: high covers [0, 1.5), low covers [1.5, 2.5) — so the cut-off is 0.6.
  assert.deepEqual(
    values.map(() => weightedPick(pool).id),
    ["high", "high", "low", "low"],
  );
  mock.restoreAll();
});
