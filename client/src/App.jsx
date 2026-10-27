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
    // The CLI and MCP server write tasks.json too, so refetch whenever the tab regains focus.
    const refresh = () =>
      getTasks()
        .then(setTasks)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    const onVisible = () => document.visibilityState === "visible" && refresh();

    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Runs a change, showing any failure in the error banner. Resolves to false if it failed.
  async function attempt(action) {
    try {
      await action();
      setError(null);
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  function handleCreate(fields) {
    return attempt(async () => {
      const task = await createTask(fields);
      setTasks((prev) => [...prev, task]);
    });
  }

  function handleUpdate(id, updates) {
    return attempt(async () => {
      const updated = await updateTask(id, updates);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    });
  }

  function handleDelete(id) {
    const task = tasks.find((t) => t.id === id);
    if (!confirm(`Delete "${task?.title}"?`)) return;
    return attempt(async () => {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    });
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
