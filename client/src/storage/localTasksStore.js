import { reactivateDueTasks, sanitizeTaskInput } from "../../../shared/taskRules.js";

const STORAGE_KEY = "rolldo:tasks";

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
