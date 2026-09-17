import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "tasks.json");
const PORT = 3001;

function readTasks() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, "utf-8").trim();
  return raw ? JSON.parse(raw) : [];
}

function writeTasks(tasks) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);

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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/tasks", (req, res) => {
  const tasks = readTasks();
  if (reactivateDueTasks(tasks)) writeTasks(tasks);
  res.json(tasks);
});

app.post("/api/tasks", (req, res) => {
  if (!req.body || typeof req.body.title !== "string" || !req.body.title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const tasks = readTasks();
  const fields = sanitizeTaskInput(req.body);
  const task = {
    id: crypto.randomUUID(),
    ...fields,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  writeTasks(tasks);
  res.status(201).json(task);
});

app.put("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "task not found" });

  const fields = sanitizeTaskInput(req.body, tasks[idx]);
  tasks[idx] = { ...tasks[idx], ...fields };
  writeTasks(tasks);
  res.json(tasks[idx]);
});

app.delete("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "task not found" });

  const [removed] = tasks.splice(idx, 1);
  writeTasks(tasks);
  res.json(removed);
});

app.listen(PORT, () => {
  console.log(`Rolldo server listening on http://localhost:${PORT}`);
});
