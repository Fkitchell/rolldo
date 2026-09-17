import { useEffect, useState } from "react";
import { getTasks, createTask, updateTask, deleteTask } from "./api.js";
import TaskList from "./components/TaskList.jsx";
import Randomizer from "./components/Randomizer.jsx";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [tab, setTab] = useState("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(fields) {
    const task = await createTask(fields);
    setTasks((prev) => [...prev, task]);
  }

  async function handleUpdate(id, updates) {
    const updated = await updateTask(id, updates);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }

  async function handleDelete(id) {
    await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎲 Rolldo</h1>
        <nav className="tabs">
          <button className={tab === "list" ? "tab-active" : ""} onClick={() => setTab("list")}>
            To-Do List
          </button>
          <button className={tab === "random" ? "tab-active" : ""} onClick={() => setTab("random")}>
            Randomizer
          </button>
        </nav>
      </header>

      <main className="app-main">
        {error && <p className="error-banner">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading tasks...</p>
        ) : tab === "list" ? (
          <TaskList tasks={tasks} onCreate={handleCreate} onUpdate={handleUpdate} onDelete={handleDelete} />
        ) : (
          <Randomizer tasks={tasks} onUpdate={handleUpdate} />
        )}
      </main>
    </div>
  );
}
