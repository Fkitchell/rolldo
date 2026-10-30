import express from "express";
import crypto from "crypto";
import { readTasks, writeTasks } from "./taskStore.js";
import { reactivateDueTasks, releaseBlockedBy, sanitizeTaskInput } from "../shared/taskRules.js";

const PORT = Number(process.env.ROLLDO_PORT) || 3001;

const app = express();
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

  const wasCompleted = tasks[idx].completed;
  const fields = sanitizeTaskInput(req.body, tasks[idx]);
  tasks[idx] = { ...tasks[idx], ...fields };
  if (tasks[idx].completed && !wasCompleted) releaseBlockedBy(tasks, tasks[idx].id);
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

// Localhost only: the API has no auth, and the Vite dev server proxies /api to it.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Rolldo server listening on http://localhost:${PORT}`);
});
