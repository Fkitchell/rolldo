import { useState } from "react";
import TaskForm from "./TaskForm.jsx";
import { formatDue } from "../../../shared/dueDates.js";
import { formatMinutes, formatRecurrence } from "../../../shared/format.js";

function formatNextDue(nextDueAt) {
  if (!nextDueAt) return null;
  return new Date(nextDueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TaskItem({ task, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="task-item task-item-editing">
        <TaskForm
          initial={task}
          onCancel={() => setEditing(false)}
          onSubmit={(updates) => {
            if (Object.keys(updates).length > 0) onUpdate(task.id, updates);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const timeLabel = formatMinutes(task.estimatedMinutes);
  const recurrenceLabel = formatRecurrence(task.recurrence);
  const nextDueLabel = formatNextDue(task.nextDueAt);
  const due = task.completed ? null : formatDue(task.dueDate);

  return (
    <li className={`task-item priority-${task.priority} ${task.completed ? "completed" : ""}`}>
      <input
        type="checkbox"
        checked={task.completed}
        onChange={(e) => onUpdate(task.id, { completed: e.target.checked })}
        aria-label="Mark complete"
      />
      <div className="task-item-body">
        <div className="task-item-title-row">
          <span className={`badge badge-${task.priority}`}>{task.priority}</span>
          <span className="task-item-title">{task.title}</span>
          {due && <span className={`badge badge-due badge-due-${due.tone}`}>{due.label}</span>}
          {timeLabel && <span className="badge badge-time">~{timeLabel}</span>}
          {recurrenceLabel && <span className="badge badge-recurring">🔁 {recurrenceLabel}</span>}
        </div>
        {(task.tags?.length > 0 || task.notes || nextDueLabel) && (
          <div className="task-item-meta">
            {task.tags?.map((tag) => (
              <span key={tag} className="tag-pill">
                {tag}
              </span>
            ))}
            {task.notes && <span className="task-item-notes">{task.notes}</span>}
            {nextDueLabel && <span className="task-item-next-due">Next: {nextDueLabel}</span>}
          </div>
        )}
      </div>
      <div className="task-item-actions">
        <button className="btn btn-icon" onClick={() => setEditing(true)} title="Edit">
          Edit
        </button>
        <button className="btn btn-icon btn-danger" onClick={() => onDelete(task.id)} title="Delete">
          Delete
        </button>
      </div>
    </li>
  );
}
