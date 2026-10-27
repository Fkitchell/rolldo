import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ROLLDO_DATA_FILE lets the CLI be pointed at a scratch copy for testing.
const DATA_FILE = process.env.ROLLDO_DATA_FILE || path.join(__dirname, "tasks.json");

export function readTasks() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, "utf-8").trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Don't fall back to [] — the next write would wipe the file.
    throw new Error(`${DATA_FILE} is not valid JSON (${err.message}); fix or restore it before continuing`);
  }
}

// Write to a temp file and rename it over the original, so a crash mid-write can't leave a half-written file.
export function writeTasks(tasks) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
export const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);

function normalizeTag(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeTags(rawTags) {
  const seen = new Map();
  for (const raw of rawTags) {
    const normalized = normalizeTag(String(raw));
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) seen.set(key, normalized);
  }
  return Array.from(seen.values());
}

function sanitizeRecurrence(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!VALID_FREQUENCIES.has(raw.frequency)) return null;
  const interval = Number(raw.interval);
  if (!Number.isFinite(interval) || interval < 1) return null;
  return { frequency: raw.frequency, interval: Math.round(interval) };
}

const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDueDate(value) {
  if (typeof value !== "string" || !DUE_DATE_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function formatDueDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sanitizeDueDate(raw) {
  const date = parseDueDate(raw);
  return date ? formatDueDate(date) : null;
}

// `day` lets callers aim for a day-of-month the source date was clamped away from
// (e.g. back to the 31st after a stop on Feb 28).
function addMonthsClamped(date, months, day = date.getDate()) {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}

export function computeNextDueDate(fromDate, recurrence, anchorDay) {
  const { frequency, interval } = recurrence;
  if (frequency === "daily") {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + interval);
    return d;
  }
  if (frequency === "weekly") {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + interval * 7);
    return d;
  }
  return addMonthsClamped(fromDate, interval, anchorDay);
}

export function reactivateDueTasks(tasks) {
  const now = new Date();
  let changed = false;
  for (const task of tasks) {
    if (task.completed && task.recurrence && task.nextDueAt && new Date(task.nextDueAt) <= now) {
      task.completed = false;
      task.nextDueAt = null;
      task.previousDueDate = null;
      changed = true;
    }
  }
  return changed;
}

export function sanitizeTaskInput(body, existing = {}) {
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : existing.title;
  const priority = VALID_PRIORITIES.has(body.priority) ? body.priority : existing.priority || "medium";
  const tags = Array.isArray(body.tags) ? normalizeTags(body.tags) : existing.tags || [];
  const notes = typeof body.notes === "string" ? body.notes : existing.notes ?? "";

  let estimatedMinutes = existing.estimatedMinutes ?? null;
  if (body.estimatedMinutes === null || body.estimatedMinutes === "") {
    estimatedMinutes = null;
  } else if (body.estimatedMinutes !== undefined) {
    const n = Number(body.estimatedMinutes);
    estimatedMinutes = Number.isFinite(n) && n > 0 ? n : null;
  }

  const recurrence =
    body.recurrence !== undefined ? sanitizeRecurrence(body.recurrence) : existing.recurrence ?? null;

  const wasCompleted = existing.completed ?? false;
  const completed = typeof body.completed === "boolean" ? body.completed : wasCompleted;

  let nextDueAt = existing.nextDueAt ?? null;
  if (!recurrence) {
    nextDueAt = null;
  } else if (completed && !wasCompleted) {
    nextDueAt = computeNextDueDate(new Date(), recurrence).toISOString();
  } else if (!completed) {
    nextDueAt = null;
  }

  const existingDueDate = existing.dueDate ?? null;
  let dueDate = body.dueDate !== undefined ? sanitizeDueDate(body.dueDate) : existingDueDate;
  const dueDateEdited = dueDate !== existingDueDate;

  // The due date from before the last completion, so unchecking can put it back exactly.
  let previousDueDate = existing.previousDueDate ?? null;
  if (!recurrence || dueDateEdited) previousDueDate = null;

  // The day-of-month the user picked, so monthly tasks return to the 31st after a short month.
  let dueAnchorDay = existing.dueAnchorDay ?? null;
  if (!dueDate) dueAnchorDay = null;
  else if (dueDateEdited || dueAnchorDay == null) dueAnchorDay = parseDueDate(dueDate).getDate();

  if (recurrence && dueDate && completed && !wasCompleted) {
    // Roll the deadline forward until it lands on or after the day the task reactivates,
    // so a task finished late doesn't come back already overdue.
    previousDueDate = dueDate;
    const reactivatesOn = new Date(nextDueAt);
    reactivatesOn.setHours(0, 0, 0, 0);
    let next = parseDueDate(dueDate);
    do {
      next = computeNextDueDate(next, recurrence, dueAnchorDay);
    } while (next < reactivatesOn);
    dueDate = formatDueDate(next);
  } else if (!completed && wasCompleted) {
    if (previousDueDate) dueDate = previousDueDate;
    previousDueDate = null;
  }

  return {
    title,
    priority,
    tags,
    notes,
    estimatedMinutes,
    recurrence,
    completed,
    nextDueAt,
    dueDate,
    previousDueDate,
    dueAnchorDay,
  };
}
