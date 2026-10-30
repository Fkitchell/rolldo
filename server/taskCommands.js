// Task-list operations shared by the CLI (cli.js) and the MCP server (mcp.js).
// Each one loads tasks.json, reactivates due recurring tasks like GET /api/tasks does, and saves any changes.
import crypto from "crypto";
import { readTasks, writeTasks } from "./taskStore.js";
import {
  VALID_FREQUENCIES,
  VALID_PRIORITIES,
  isReady,
  parseDueDate,
  reactivateDueTasks,
  releaseBlockedBy,
  sanitizeTaskInput,
} from "../shared/taskRules.js";
import { compareDueDates, daysUntilDue, formatDue } from "../shared/dueDates.js";
import { weightedPick } from "../shared/pick.js";

export class TaskError extends Error {}

function fail(message) {
  throw new TaskError(message);
}

function parseRepeat(value) {
  if (value === "none") return null;
  const [frequency, interval = "1"] = value.split(":");
  if (!VALID_FREQUENCIES.has(frequency)) fail(`invalid repeat "${value}"`);
  const n = Number(interval);
  if (!Number.isInteger(n) || n < 1) fail(`invalid repeat interval "${interval}"`);
  return { frequency, interval: n };
}

function parseDateField(name, value) {
  const date = value === null ? "none" : String(value);
  if (date !== "none" && !parseDueDate(date)) fail(`invalid ${name} date "${date}" (use YYYY-MM-DD)`);
  return date === "none" ? null : date;
}

// Turns friendly fields into the request body shape sanitizeTaskInput expects.
// `tags` and `blocked_by` may be arrays or comma-separated strings; "none" clears due, start, minutes,
// repeat and blocked_by. `blocked_by` holds ids or prefixes, which resolveBlockers turns into full ids.
function toBody(fields) {
  const body = {};
  if (fields.title !== undefined) {
    if (!String(fields.title).trim()) fail("title cannot be empty");
    body.title = String(fields.title);
  }
  if (fields.priority !== undefined) {
    if (!VALID_PRIORITIES.has(fields.priority)) fail(`invalid priority "${fields.priority}"`);
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
  if (fields.due !== undefined) body.dueDate = parseDateField("due", fields.due);
  if (fields.start !== undefined) body.startDate = parseDateField("start", fields.start);
  if (fields.blocked_by !== undefined) {
    const refs = fields.blocked_by === null || fields.blocked_by === "none" ? [] : fields.blocked_by;
    body.blockedBy = (Array.isArray(refs) ? refs : String(refs).split(",")).map((r) => String(r).trim()).filter(Boolean);
  }
  return body;
}

// Swaps the id prefixes in body.blockedBy for full ids.
function resolveBlockers(tasks, body) {
  if (body.blockedBy) body.blockedBy = body.blockedBy.map((ref) => tasks[findIndex(tasks, ref)].id);
  return body;
}

// Adds friendly fields, including why a task isn't ready yet: the open tasks it's waiting on
// and the day it starts.
function present(task, tasksById) {
  const waitingOn = (task.blockedBy ?? []).map((id) => tasksById.get(id)).filter((t) => t && !t.completed);
  const notStarted = !isReady({ startDate: task.startDate }, tasksById);
  return {
    ...task,
    daysUntilDue: daysUntilDue(task.dueDate),
    dueLabel: formatDue(task.dueDate)?.label ?? null,
    ready: isReady(task, tasksById),
    waitingOn: waitingOn.map((t) => t.title),
    startLabel: notStarted ? `Starts ${formatStart(task.startDate)}` : null,
  };
}

function formatStart(startDate) {
  return parseDueDate(startDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const byId = (tasks) => new Map(tasks.map((t) => [t.id, t]));

function presentAll(tasks, subset) {
  const tasksById = byId(tasks);
  return subset.map((t) => present(t, tasksById));
}

function filterTasks(tasks, filters = {}) {
  let result = filters.all ? tasks : tasks.filter((t) => !t.completed);
  if (filters.ready) {
    const tasksById = byId(tasks);
    result = result.filter((t) => isReady(t, tasksById));
  }
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

// Runs `fn` against the loaded task list and saves it if anything changed.
function withTasks(fn) {
  const tasks = readTasks();
  const reactivated = reactivateDueTasks(tasks);
  const { result, changed } = fn(tasks);
  if (changed || reactivated) writeTasks(tasks);
  return result;
}

export function listTasks(filters) {
  return withTasks((tasks) => ({ result: presentAll(tasks, filterTasks(tasks, filters).sort(compareDueDates)) }));
}

export function findTasks(text, filters) {
  const query = String(text ?? "").toLowerCase();
  if (!query) fail("search text is required");
  return withTasks((tasks) => ({
    result: presentAll(
      tasks,
      filterTasks(tasks, filters).filter((t) => t.title.toLowerCase().includes(query) || t.notes.toLowerCase().includes(query)),
    ),
  }));
}

export function addTask(fields) {
  const body = toBody(fields);
  if (typeof body.title !== "string") fail("title is required");
  return withTasks((tasks) => {
    const fields = sanitizeTaskInput(resolveBlockers(tasks, body));
    const task = { id: crypto.randomUUID(), ...fields, createdAt: new Date().toISOString() };
    tasks.push(task);
    return { result: present(task, byId(tasks)), changed: true };
  });
}

function changeTask(id, body) {
  return withTasks((tasks) => {
    const idx = findIndex(tasks, id);
    const wasCompleted = tasks[idx].completed;
    tasks[idx] = { ...tasks[idx], ...sanitizeTaskInput(resolveBlockers(tasks, body), tasks[idx]) };
    if (tasks[idx].completed && !wasCompleted) releaseBlockedBy(tasks, tasks[idx].id);
    return { result: present(tasks[idx], byId(tasks)), changed: true };
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
    return { result: present(removed, byId(tasks)), changed: true };
  });
}

export function rollTask(filters) {
  return withTasks((tasks) => {
    const pool = filterTasks(tasks, { ...filters, all: false, ready: true });
    return { result: pool.length ? present(weightedPick(pool), byId(tasks)) : null };
  });
}
