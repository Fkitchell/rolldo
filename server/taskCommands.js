// Task-list operations shared by the CLI (cli.js) and the MCP server (mcp.js).
// Each one loads tasks.json, reactivates due recurring tasks like GET /api/tasks does, and saves any changes.
import crypto from "crypto";
import { readTasks, writeTasks, reactivateDueTasks, sanitizeTaskInput } from "./taskLogic.js";
import { compareDueDates, daysUntilDue, formatDue, urgencyMultiplier } from "../client/src/dueDates.js";

// Mirrors PRIORITY_WEIGHTS in client/src/components/Randomizer.jsx — keep the two in sync.
const PRIORITY_WEIGHTS = { high: 1.5, medium: 1.25, low: 1 };

export class TaskError extends Error {}

function fail(message) {
  throw new TaskError(message);
}

function parseRepeat(value) {
  if (value === "none") return null;
  const [frequency, interval = "1"] = value.split(":");
  if (!["daily", "weekly", "monthly"].includes(frequency)) fail(`invalid repeat "${value}"`);
  const n = Number(interval);
  if (!Number.isInteger(n) || n < 1) fail(`invalid repeat interval "${interval}"`);
  return { frequency, interval: n };
}

// Turns friendly fields into the request body shape sanitizeTaskInput expects.
// `tags` may be an array or a comma-separated string; "none" clears due, minutes and repeat.
function toBody(fields) {
  const body = {};
  if (fields.title !== undefined) {
    if (!String(fields.title).trim()) fail("title cannot be empty");
    body.title = String(fields.title);
  }
  if (fields.priority !== undefined) {
    if (!["high", "medium", "low"].includes(fields.priority)) fail(`invalid priority "${fields.priority}"`);
    body.priority = fields.priority;
  }
  if (fields.tags !== undefined) {
    const tags = Array.isArray(fields.tags) ? fields.tags : String(fields.tags).split(",");
    body.tags = tags.filter((t) => String(t).trim());
  }
  if (fields.notes !== undefined) body.notes = String(fields.notes);
  if (fields.minutes !== undefined) {
    body.estimatedMinutes = fields.minutes === "none" || fields.minutes === null ? null : fields.minutes;
  }
  if (fields.repeat !== undefined) body.recurrence = fields.repeat === null ? null : parseRepeat(String(fields.repeat));
  if (fields.due !== undefined) {
    const due = fields.due === null ? "none" : String(fields.due);
    if (due !== "none" && !/^\d{4}-\d{2}-\d{2}$/.test(due)) fail(`invalid due date "${due}" (use YYYY-MM-DD)`);
    body.dueDate = due === "none" ? null : due;
  }
  return body;
}

function present(task) {
  return {
    ...task,
    daysUntilDue: daysUntilDue(task.dueDate),
    dueLabel: formatDue(task.dueDate)?.label ?? null,
  };
}

function filterTasks(tasks, filters = {}) {
  let result = filters.all ? tasks : tasks.filter((t) => !t.completed);
  if (filters.tag) {
    const tag = filters.tag.toLowerCase();
    result = result.filter((t) => t.tags.some((x) => x.toLowerCase() === tag));
  }
  if (filters.priority) result = result.filter((t) => t.priority === filters.priority);
  if (filters.dueWithin !== undefined) {
    const n = Number(filters.dueWithin);
    result = result.filter((t) => t.dueDate && daysUntilDue(t.dueDate) <= n);
  }
  if (filters.maxMinutes !== undefined) {
    const n = Number(filters.maxMinutes);
    result = result.filter((t) => t.estimatedMinutes == null || t.estimatedMinutes <= n);
  }
  return result;
}

function findIndex(tasks, id) {
  if (!id) fail("a task id is required");
  const matches = tasks.map((t, i) => [t, i]).filter(([t]) => t.id.startsWith(id));
  if (matches.length === 0) fail(`task not found: ${id}`);
  if (matches.length > 1) fail(`id prefix "${id}" matches ${matches.length} tasks; use more characters`);
  return matches[0][1];
}

function weightedPick(pool) {
  const weightOf = (t) => (PRIORITY_WEIGHTS[t.priority] ?? PRIORITY_WEIGHTS.medium) * urgencyMultiplier(t);
  const total = pool.reduce((sum, t) => sum + weightOf(t), 0);
  let r = Math.random() * total;
  for (const t of pool) {
    r -= weightOf(t);
    if (r < 0) return t;
  }
  return pool[pool.length - 1];
}

// Runs `fn` against the loaded task list and saves it if anything changed.
function withTasks(fn) {
  const tasks = readTasks();
  const reactivated = reactivateDueTasks(tasks);
  const { result, changed } = fn(tasks);
  if (changed || reactivated) writeTasks(tasks);
  return result;
}

export function listTasks(filters) {
  return withTasks((tasks) => ({ result: filterTasks(tasks, filters).sort(compareDueDates).map(present) }));
}

export function findTasks(text, filters) {
  const query = String(text ?? "").toLowerCase();
  if (!query) fail("search text is required");
  return withTasks((tasks) => ({
    result: filterTasks(tasks, filters)
      .filter((t) => t.title.toLowerCase().includes(query) || t.notes.toLowerCase().includes(query))
      .map(present),
  }));
}

export function addTask(fields) {
  const body = toBody(fields);
  if (typeof body.title !== "string") fail("title is required");
  return withTasks((tasks) => {
    const task = { id: crypto.randomUUID(), ...sanitizeTaskInput(body), createdAt: new Date().toISOString() };
    tasks.push(task);
    return { result: present(task), changed: true };
  });
}

function changeTask(id, body) {
  return withTasks((tasks) => {
    const idx = findIndex(tasks, id);
    tasks[idx] = { ...tasks[idx], ...sanitizeTaskInput(body, tasks[idx]) };
    return { result: present(tasks[idx]), changed: true };
  });
}

export function updateTask(id, fields) {
  return changeTask(id, toBody(fields));
}

export function setCompleted(id, completed) {
  return changeTask(id, { completed });
}

export function deleteTask(id) {
  return withTasks((tasks) => {
    const [removed] = tasks.splice(findIndex(tasks, id), 1);
    return { result: present(removed), changed: true };
  });
}

export function rollTask(filters) {
  return withTasks((tasks) => {
    const pool = filterTasks(tasks, { ...filters, all: false });
    return { result: pool.length ? present(weightedPick(pool)) : null };
  });
}
