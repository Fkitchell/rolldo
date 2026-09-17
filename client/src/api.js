import * as localTasksStore from "./storage/localTasksStore.js";

const BASE = "/api/tasks";

// The GitHub Pages build (`npm run build:pages`, mode "github-pages") has no
// Express backend to talk to, so it persists tasks in the browser instead.
const USE_LOCAL_STORAGE = import.meta.env.MODE === "github-pages";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

function getTasksRemote() {
  return fetch(BASE).then(handle);
}

function createTaskRemote(task) {
  return fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  }).then(handle);
}

function updateTaskRemote(id, updates) {
  return fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }).then(handle);
}

function deleteTaskRemote(id) {
  return fetch(`${BASE}/${id}`, { method: "DELETE" }).then(handle);
}

export const getTasks = USE_LOCAL_STORAGE ? localTasksStore.getTasks : getTasksRemote;
export const createTask = USE_LOCAL_STORAGE ? localTasksStore.createTask : createTaskRemote;
export const updateTask = USE_LOCAL_STORAGE ? localTasksStore.updateTask : updateTaskRemote;
export const deleteTask = USE_LOCAL_STORAGE ? localTasksStore.deleteTask : deleteTaskRemote;
