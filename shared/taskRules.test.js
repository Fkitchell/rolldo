import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTags,
  parseDueDate,
  formatDueDate,
  computeNextDueDate,
  reactivateDueTasks,
  sanitizeTaskInput,
  isReady,
  releaseBlockedBy,
} from "./taskRules.js";

// Freezes `new Date()` at a local-time moment so recurrence math is deterministic.
function setNow(y, m, d, h = 10) {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: new Date(y, m - 1, d, h).getTime() });
}

afterEach(() => mock.timers.reset());

describe("normalizeTags", () => {
  test("title-cases, trims and de-duplicates case-insensitively", () => {
    assert.deepEqual(normalizeTags(["home", " HOME ", "quick  errand", "", "Quick Errand"]), ["Home", "Quick Errand"]);
  });
});

describe("parseDueDate / formatDueDate", () => {
  test("accepts real YYYY-MM-DD dates and round-trips them", () => {
    assert.equal(formatDueDate(parseDueDate("2026-02-28")), "2026-02-28");
  });

  test("rejects impossible or malformed dates", () => {
    for (const bad of ["2026-02-30", "2026-2-3", "tomorrow", "", null, undefined]) {
      assert.equal(parseDueDate(bad), null, String(bad));
    }
  });
});

describe("computeNextDueDate", () => {
  test("daily and weekly add whole days", () => {
    const from = parseDueDate("2026-10-27");
    assert.equal(formatDueDate(computeNextDueDate(from, { frequency: "daily", interval: 3 })), "2026-10-30");
    assert.equal(formatDueDate(computeNextDueDate(from, { frequency: "weekly", interval: 2 })), "2026-11-10");
  });

  test("monthly clamps to short months and returns to the anchor day", () => {
    const monthly = { frequency: "monthly", interval: 1 };
    const feb = computeNextDueDate(parseDueDate("2026-01-31"), monthly);
    assert.equal(formatDueDate(feb), "2026-02-28");
    assert.equal(formatDueDate(computeNextDueDate(feb, monthly, 31)), "2026-03-31");
    assert.equal(formatDueDate(computeNextDueDate(feb, monthly)), "2026-03-28");
  });
});

describe("sanitizeTaskInput", () => {
  test("fills defaults for a new task", () => {
    assert.deepEqual(sanitizeTaskInput({ title: "  Water plants  " }), {
      title: "Water plants",
      priority: "medium",
      tags: [],
      notes: "",
      estimatedMinutes: null,
      recurrence: null,
      completed: false,
      nextDueAt: null,
      dueDate: null,
      previousDueDate: null,
      dueAnchorDay: null,
      blockedBy: [],
      startDate: null,
    });
  });

  test("blockedBy drops blanks, duplicates and the task itself; startDate is validated", () => {
    const existing = { id: "me", ...sanitizeTaskInput({ title: "t", blockedBy: ["a", " a ", "", "b"], startDate: "2026-11-02" }) };
    assert.deepEqual(existing.blockedBy, ["a", "b"]);
    assert.equal(existing.startDate, "2026-11-02");
    assert.deepEqual(sanitizeTaskInput({ blockedBy: ["me", "c"] }, existing).blockedBy, ["c"]);
    assert.deepEqual(sanitizeTaskInput({ blockedBy: "x" }, existing).blockedBy, ["a", "b"]);
    assert.equal(sanitizeTaskInput({ startDate: "2026-02-30" }, existing).startDate, null);
    assert.equal(sanitizeTaskInput({}, existing).startDate, "2026-11-02");
  });

  test("keeps existing values for blank title and invalid priority", () => {
    const existing = sanitizeTaskInput({ title: "Keep me", priority: "high" });
    const out = sanitizeTaskInput({ title: "   ", priority: "urgent" }, existing);
    assert.equal(out.title, "Keep me");
    assert.equal(out.priority, "high");
  });

  test("estimatedMinutes: blank or non-positive clears, numbers pass through", () => {
    const existing = sanitizeTaskInput({ title: "t", estimatedMinutes: 30 });
    assert.equal(existing.estimatedMinutes, 30);
    assert.equal(sanitizeTaskInput({}, existing).estimatedMinutes, 30);
    assert.equal(sanitizeTaskInput({ estimatedMinutes: "" }, existing).estimatedMinutes, null);
    assert.equal(sanitizeTaskInput({ estimatedMinutes: "-5" }, existing).estimatedMinutes, null);
  });

  test("recurrence: invalid becomes null, interval is rounded", () => {
    assert.equal(sanitizeTaskInput({ title: "t", recurrence: { frequency: "yearly", interval: 1 } }).recurrence, null);
    assert.equal(sanitizeTaskInput({ title: "t", recurrence: { frequency: "daily", interval: 0 } }).recurrence, null);
    assert.deepEqual(sanitizeTaskInput({ title: "t", recurrence: { frequency: "weekly", interval: 2.6 } }).recurrence, {
      frequency: "weekly",
      interval: 3,
    });
  });

  test("an invalid due date is dropped and the anchor follows the due date", () => {
    assert.equal(sanitizeTaskInput({ title: "t", dueDate: "2026-02-30" }).dueDate, null);
    const t = sanitizeTaskInput({ title: "t", dueDate: "2026-10-31" });
    assert.equal(t.dueAnchorDay, 31);
    assert.equal(sanitizeTaskInput({ dueDate: "2026-11-04" }, t).dueAnchorDay, 4);
    assert.equal(sanitizeTaskInput({ dueDate: null }, t).dueAnchorDay, null);
  });

  describe("completing and uncompleting recurring tasks", () => {
    beforeEach(() => setNow(2026, 10, 27));

    test("on-time completion rolls the due date one period and schedules reactivation", () => {
      const task = sanitizeTaskInput({ title: "t", dueDate: "2026-10-27", recurrence: { frequency: "weekly", interval: 1 } });
      const done = sanitizeTaskInput({ completed: true }, task);
      assert.equal(done.completed, true);
      assert.equal(done.dueDate, "2026-11-03");
      assert.equal(done.previousDueDate, "2026-10-27");
      assert.equal(new Date(done.nextDueAt).getTime(), new Date(2026, 10, 3, 10).getTime());
    });

    test("late completion rolls the due date past the reactivation day", () => {
      const task = sanitizeTaskInput({ title: "t", dueDate: "2026-10-20", recurrence: { frequency: "daily", interval: 1 } });
      const done = sanitizeTaskInput({ completed: true }, task);
      assert.equal(done.dueDate, "2026-10-28");
    });

    test("uncompleting restores the previous due date and clears the schedule", () => {
      const task = sanitizeTaskInput({ title: "t", dueDate: "2026-10-27", recurrence: { frequency: "daily", interval: 2 } });
      const undone = sanitizeTaskInput({ completed: false }, sanitizeTaskInput({ completed: true }, task));
      assert.equal(undone.completed, false);
      assert.equal(undone.dueDate, "2026-10-27");
      assert.equal(undone.previousDueDate, null);
      assert.equal(undone.nextDueAt, null);
    });

    test("monthly task anchored on the 31st comes back to the 31st after February", () => {
      setNow(2026, 1, 31);
      const task = sanitizeTaskInput({ title: "t", dueDate: "2026-01-31", recurrence: { frequency: "monthly", interval: 1 } });
      const jan = sanitizeTaskInput({ completed: true }, task);
      assert.equal(jan.dueDate, "2026-02-28");
      assert.equal(jan.dueAnchorDay, 31);

      setNow(2026, 2, 28);
      const reopened = [{ ...jan }];
      reactivateDueTasks(reopened);
      const feb = sanitizeTaskInput({ completed: true }, reopened[0]);
      assert.equal(feb.dueDate, "2026-03-31");
    });

    test("removing recurrence clears the reactivation schedule", () => {
      const task = sanitizeTaskInput({ title: "t", recurrence: { frequency: "daily", interval: 1 } });
      const done = sanitizeTaskInput({ completed: true }, task);
      assert.ok(done.nextDueAt);
      assert.equal(sanitizeTaskInput({ recurrence: null }, done).nextDueAt, null);
    });
  });
});

describe("isReady / releaseBlockedBy", () => {
  const tasks = [
    { id: "open", completed: false },
    { id: "done", completed: true },
  ];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  test("waits for a future start date and for open blockers only", () => {
    assert.equal(isReady({}, byId, "2026-10-30"), true);
    assert.equal(isReady({ startDate: "2026-10-31" }, byId, "2026-10-30"), false);
    assert.equal(isReady({ startDate: "2026-10-30" }, byId, "2026-10-30"), true);
    assert.equal(isReady({ blockedBy: ["open"] }, byId, "2026-10-30"), false);
    assert.equal(isReady({ blockedBy: ["done", "deleted"] }, byId, "2026-10-30"), true);
  });

  test("releaseBlockedBy removes the finished task from every list", () => {
    const list = [{ id: "a", blockedBy: ["x", "y"] }, { id: "b", blockedBy: ["y"] }, { id: "c" }];
    assert.equal(releaseBlockedBy(list, "y"), true);
    assert.deepEqual(list.map((t) => t.blockedBy), [["x"], [], undefined]);
    assert.equal(releaseBlockedBy(list, "y"), false);
  });
});

describe("reactivateDueTasks", () => {
  test("reopens completed recurring tasks whose time has come, and only those", () => {
    setNow(2026, 10, 27);
    const tasks = [
      { id: "due", completed: true, recurrence: { frequency: "daily", interval: 1 }, nextDueAt: new Date(2026, 9, 27, 9).toISOString(), previousDueDate: "2026-10-26" },
      { id: "later", completed: true, recurrence: { frequency: "daily", interval: 1 }, nextDueAt: new Date(2026, 9, 28).toISOString() },
      { id: "oneoff", completed: true, recurrence: null, nextDueAt: null },
    ];
    assert.equal(reactivateDueTasks(tasks), true);
    assert.deepEqual(
      tasks.map((t) => t.completed),
      [false, true, true],
    );
    assert.equal(tasks[0].nextDueAt, null);
    assert.equal(tasks[0].previousDueDate, null);
    assert.equal(reactivateDueTasks(tasks), false);
  });
});
