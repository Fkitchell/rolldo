import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// taskStore.js reads ROLLDO_DATA_FILE at import time, so set it before loading the commands.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rolldo-test-"));
process.env.ROLLDO_DATA_FILE = path.join(dir, "tasks.json");
const { TaskError, listTasks, findTasks, addTask, updateTask, setCompleted, deleteTask, rollTask } = await import(
  "./taskCommands.js"
);

before(() => fs.rmSync(process.env.ROLLDO_DATA_FILE, { force: true }));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("add, find, update, complete, uncomplete, delete round-trip through tasks.json", () => {
  const added = addTask({ title: "Buy milk", tags: "errand, Quick", priority: "high", due: "2030-01-15", minutes: "15" });
  assert.deepEqual(added.tags, ["Errand", "Quick"]);
  assert.equal(added.estimatedMinutes, 15);
  assert.equal(typeof added.daysUntilDue, "number");
  assert.match(added.dueLabel, /^Due /);

  const [found] = findTasks("milk");
  assert.equal(found.id, added.id);

  const prefix = added.id.slice(0, 8);
  assert.equal(updateTask(prefix, { notes: "2%", due: "none" }).dueDate, null);
  assert.equal(setCompleted(prefix, true).completed, true);
  assert.equal(listTasks({}).length, 0);
  assert.equal(listTasks({ all: true }).length, 1);
  assert.equal(setCompleted(prefix, false).completed, false);

  const onDisk = JSON.parse(fs.readFileSync(process.env.ROLLDO_DATA_FILE, "utf-8"));
  assert.equal(onDisk[0].notes, "2%");

  deleteTask(prefix);
  assert.equal(listTasks({ all: true }).length, 0);
});

test("rejects bad input with TaskError", () => {
  assert.throws(() => addTask({ title: "  " }), TaskError);
  assert.throws(() => addTask({ title: "x", priority: "urgent" }), TaskError);
  assert.throws(() => addTask({ title: "x", repeat: "yearly" }), TaskError);
  assert.throws(() => addTask({ title: "x", due: "Friday" }), TaskError);
  assert.throws(() => updateTask("does-not-exist", { title: "y" }), TaskError);
});

test("roll picks only from open tasks matching the filters", () => {
  const a = addTask({ title: "Quick one", minutes: 5, tags: ["home"] });
  addTask({ title: "Long one", minutes: 120, tags: ["home"] });
  const done = addTask({ title: "Done one", minutes: 5 });
  setCompleted(done.id, true);

  for (let i = 0; i < 20; i++) assert.equal(rollTask({ maxMinutes: 30 }).id, a.id);
  assert.equal(rollTask({ tag: "work" }), null);
});

test("blocked and not-yet-started tasks stay out of ready lists and rolls until they're ready", () => {
  const blocker = addTask({ title: "Get the quote", tags: ["deps"] });
  const waiting = addTask({ title: "Sign the contract", tags: ["deps"], blocked_by: blocker.id.slice(0, 8) });
  assert.deepEqual(waiting.blockedBy, [blocker.id]);
  assert.deepEqual(waiting.waitingOn, ["Get the quote"]);
  assert.equal(waiting.ready, false);
  assert.throws(() => updateTask(waiting.id, { blocked_by: "nope" }), TaskError);
  assert.throws(() => updateTask(waiting.id, { start: "soon" }), TaskError);

  const later = addTask({ title: "Renew", tags: ["deps"], start: "2099-01-01" });
  assert.match(later.startLabel, /^Starts /);

  assert.deepEqual(listTasks({ tag: "deps", ready: true }).map((t) => t.id), [blocker.id]);
  assert.equal(listTasks({ tag: "deps" }).length, 3);
  for (let i = 0; i < 20; i++) assert.equal(rollTask({ tag: "deps" }).id, blocker.id);

  setCompleted(blocker.id, true);
  const [ready] = listTasks({ tag: "deps", ready: true });
  assert.equal(ready.id, waiting.id);
  assert.deepEqual(ready.blockedBy, [], "a finished blocker is removed so a repeat can't re-block");

  assert.equal(updateTask(later.id, { start: "none" }).ready, true);
  assert.equal(updateTask(waiting.id, { blocked_by: [later.id] }).ready, false);
  assert.deepEqual(updateTask(waiting.id, { blocked_by: "none" }).blockedBy, []);
});
