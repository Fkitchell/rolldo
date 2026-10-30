import { useState } from "react";

const emptyForm = {
  title: "",
  priority: "medium",
  tagsText: "",
  notes: "",
  estimatedValue: "",
  estimatedUnit: "minutes",
  recurrenceFrequency: "none",
  recurrenceInterval: "1",
  dueDate: "",
  startDate: "",
  blockedBy: [],
};

function toMinutes(value, unit) {
  if (value === "" || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "hours" ? Math.round(n * 60) : Math.round(n);
}

function toForm(task) {
  const usingHours = task.estimatedMinutes && task.estimatedMinutes % 60 === 0 && task.estimatedMinutes >= 60;
  return {
    title: task.title || "",
    priority: task.priority || "medium",
    tagsText: (task.tags || []).join(", "),
    notes: task.notes || "",
    estimatedValue: task.estimatedMinutes
      ? String(usingHours ? task.estimatedMinutes / 60 : task.estimatedMinutes)
      : "",
    estimatedUnit: usingHours ? "hours" : "minutes",
    recurrenceFrequency: task.recurrence?.frequency || "none",
    recurrenceInterval: String(task.recurrence?.interval || 1),
    dueDate: task.dueDate || "",
    startDate: task.startDate || "",
    blockedBy: task.blockedBy || [],
  };
}

function toFields(form) {
  const recurrence =
    form.recurrenceFrequency === "none"
      ? null
      : {
          frequency: form.recurrenceFrequency,
          interval: Math.max(1, Math.round(Number(form.recurrenceInterval)) || 1),
        };

  return {
    title: form.title.trim(),
    priority: form.priority,
    tags: form.tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    notes: form.notes.trim(),
    estimatedMinutes: toMinutes(form.estimatedValue, form.estimatedUnit),
    recurrence,
    dueDate: form.dueDate || null,
    startDate: form.startDate || null,
    blockedBy: form.blockedBy,
  };
}

export default function TaskForm({ onSubmit, initial, onCancel, tasks = [] }) {
  // Snapshot the task as it was when editing began; a refetch may change `initial` mid-edit.
  const [original] = useState(initial);
  const [form, setForm] = useState(() => (initial ? toForm(initial) : emptyForm));

  // Open tasks this one can wait on, plus any it already waits on.
  const blockerOptions = tasks.filter(
    (t) => t.id !== initial?.id && (!t.completed || form.blockedBy.includes(t.id)),
  );

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const fields = toFields(form);
    if (!fields.title) return;

    if (!original) {
      // Keep the input if the create failed, so it can be retried.
      if ((await onSubmit(fields)) !== false) setForm(emptyForm);
      return;
    }

    // Send only the fields the user changed, so saving doesn't overwrite
    // edits the CLI or MCP server made to fields this form merely loaded.
    const before = toFields(toForm(original));
    onSubmit(
      Object.fromEntries(Object.entries(fields).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])))
    );
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="task-form-row">
        <input
          className="task-form-title"
          type="text"
          placeholder="What needs doing?"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          required
        />
      </div>

      <div className="task-form-row task-form-row-grid">
        <label className="field">
          <span>Priority</span>
          <select value={form.priority} onChange={(e) => update("priority", e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="field">
          <span>Tags</span>
          <input
            type="text"
            placeholder="home, quick, errand"
            value={form.tagsText}
            onChange={(e) => update("tagsText", e.target.value)}
          />
        </label>

        <label className="field">
          <span>Est. time</span>
          <div className="field-inline">
            <input
              type="number"
              min="0"
              placeholder="e.g. 30"
              value={form.estimatedValue}
              onChange={(e) => update("estimatedValue", e.target.value)}
            />
            <select value={form.estimatedUnit} onChange={(e) => update("estimatedUnit", e.target.value)}>
              <option value="minutes">min</option>
              <option value="hours">hrs</option>
            </select>
          </div>
        </label>
      </div>

      <div className="task-form-row task-form-row-schedule">
        <label className="field">
          <span>Due</span>
          <input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} />
        </label>

        <label className="field">
          <span>Repeats</span>
          <div className="field-inline field-inline-recurrence">
            <select
              value={form.recurrenceFrequency}
              onChange={(e) => update("recurrenceFrequency", e.target.value)}
            >
              <option value="none">Doesn't repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {form.recurrenceFrequency !== "none" && (
              <>
                <span className="field-inline-text">every</span>
                <input
                  type="number"
                  min="1"
                  className="recurrence-interval-input"
                  title="Repeat interval"
                  value={form.recurrenceInterval}
                  onChange={(e) => update("recurrenceInterval", e.target.value)}
                />
                <span className="field-inline-text">
                  {form.recurrenceFrequency === "daily"
                    ? "day(s)"
                    : form.recurrenceFrequency === "weekly"
                      ? "week(s)"
                      : "month(s)"}
                </span>
              </>
            )}
          </div>
        </label>
      </div>

      <div className="task-form-row task-form-row-schedule">
        <label className="field">
          <span>Not before</span>
          <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} />
        </label>

        {blockerOptions.length > 0 && (
          <label className="field">
            <span>Waiting on (Ctrl+click for several)</span>
            <select
              multiple
              size={Math.min(4, blockerOptions.length)}
              value={form.blockedBy}
              onChange={(e) =>
                update(
                  "blockedBy",
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
            >
              {blockerOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="task-form-row">
        <textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={2}
        />
      </div>

      <div className="task-form-actions">
        <button type="submit" className="btn btn-primary">
          {initial ? "Save changes" : "Add task"}
        </button>
        {initial && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
