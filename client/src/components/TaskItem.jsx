import { useState } from "react";
import TaskForm from "./TaskForm.jsx";

function formatMinutes(minutes) {
  if (!minutes) return null;
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60}h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatRecurrence(recurrence) {
  if (!recurrence) return null;
  const { frequency, interval } = recurrence;
  if (interval === 1) return frequency === "daily" ? "Daily" : frequency === "weekly" ? "Weekly" : "Monthly";
  const unit = frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : "months";
  return `Every ${interval} ${unit}`;
}

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
            onUpdate(task.id, updates);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const timeLabel = formatMinutes(task.estimatedMinutes);
  const recurrenceLabel = formatRecurrence(task.recurrence);
  const nextDueLabel = formatNextDue(task.nextDueAt);

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
