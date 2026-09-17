import { useState } from "react";
import TaskForm from "./TaskForm.jsx";
import TaskItem from "./TaskItem.jsx";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function TaskList({ tasks, onCreate, onUpdate, onDelete }) {
  const [showCompleted, setShowCompleted] = useState(false);

  const active = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const completed = tasks.filter((t) => t.completed);

  return (
    <div className="task-list-view">
      <TaskForm onSubmit={onCreate} />

      {active.length === 0 ? (
        <p className="empty-state">No active tasks. Add one above to get rolling.</p>
      ) : (
        <ul className="task-list">
          {active.map((task) => (
            <TaskItem key={task.id} task={task} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {completed.length > 0 && (
        <div className="completed-section">
          <button className="btn btn-ghost" onClick={() => setShowCompleted((s) => !s)}>
            {showCompleted ? "Hide" : "Show"} completed ({completed.length})
          </button>
          {showCompleted && (
            <ul className="task-list">
              {completed.map((task) => (
                <TaskItem key={task.id} task={task} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
