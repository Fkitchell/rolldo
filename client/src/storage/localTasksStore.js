const STORAGE_KEY = "rolldo:tasks";

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);

function readTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function normalizeTag(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTags(rawTags) {
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

function addMonthsClamped(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}

function computeNextDueDate(fromDate, recurrence) {
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
  return addMonthsClamped(fromDate, interval);
}

function reactivateDueTasks(tasks) {
  const now = new Date();
  let changed = false;
  for (const task of tasks) {
    if (task.completed && task.recurrence && task.nextDueAt && new Date(task.nextDueAt) <= now) {
      task.completed = false;
      task.nextDueAt = null;
      changed = true;
    }
  }
  return changed;
}

function sanitizeTaskInput(body, existing = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : existing.title;
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

  return { title, priority, tags, notes, estimatedMinutes, recurrence, completed, nextDueAt };
}

export function getTasks() {
  const tasks = readTasks();
  if (reactivateDueTasks(tasks)) writeTasks(tasks);
  return Promise.resolve(tasks);
}

export function createTask(task) {
  if (typeof task.title !== "string" || !task.title.trim()) {
    return Promise.reject(new Error("title is required"));
  }
  const tasks = readTasks();
  const fields = sanitizeTaskInput(task);
  const created = {
    id: crypto.randomUUID(),
    ...fields,
    createdAt: new Date().toISOString(),
  };
  tasks.push(created);
  writeTasks(tasks);
  return Promise.resolve(created);
}

export function updateTask(id, updates) {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return Promise.reject(new Error("task not found"));

  const fields = sanitizeTaskInput(updates, tasks[idx]);
  tasks[idx] = { ...tasks[idx], ...fields };
  writeTasks(tasks);
  return Promise.resolve(tasks[idx]);
}

export function deleteTask(id) {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return Promise.reject(new Error("task not found"));

  const [removed] = tasks.splice(idx, 1);
  writeTasks(tasks);
  return Promise.resolve(removed);
}
