import { useEffect, useMemo, useRef, useState } from "react";
import { formatDue, urgencyMultiplier } from "../dueDates.js";

const PRIORITIES = ["high", "medium", "low"];

// Relative odds of a task being picked — a high task is 1.5x as likely as a low one.
// A looming due date multiplies these further (see urgencyMultiplier).
const PRIORITY_WEIGHTS = { high: 1.5, medium: 1.25, low: 1 };

function weightedPick(pool) {
  const weightOf = (t) => (PRIORITY_WEIGHTS[t.priority] ?? PRIORITY_WEIGHTS.medium) * urgencyMultiplier(t);
  const total = pool.reduce((sum, t) => sum + weightOf(t), 0);
  let r = Math.random() * total;
  for (const t of pool) {
    r -= weightOf(t);
    if (r < 0) return t;
  }
  return pool[pool.length - 1];
}

// Delay (ms) before each successive flicker step during the spin — increasing values
// create the slot-machine deceleration feel.
const SPIN_DELAYS = [70, 70, 80, 90, 100, 120, 140, 170, 200, 240, 290, 350, 420];

function formatMinutes(minutes) {
  if (!minutes) return null;
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60}h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function minutesUntil(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  return Math.round((target - now) / 60000);
}

export default function Randomizer({ tasks, onUpdate }) {
  const [selectedPriorities, setSelectedPriorities] = useState(new Set(PRIORITIES));
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [timeMode, setTimeMode] = useState("none"); // "none" | "have" | "deadline"
  const [minutesHave, setMinutesHave] = useState("");
  const [deadline, setDeadline] = useState("");
  const [pickedId, setPickedId] = useState(null);
  const [emptyNotice, setEmptyNotice] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinDisplay, setSpinDisplay] = useState(null);
  const [spinTick, setSpinTick] = useState(0);
  const [justLanded, setJustLanded] = useState(false);
  const spinTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const allTags = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => t.tags?.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tasks]);

  const availableMinutes = useMemo(() => {
    if (timeMode === "have") {
      const n = Number(minutesHave);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (timeMode === "deadline") {
      return minutesUntil(deadline);
    }
    return null;
  }, [timeMode, minutesHave, deadline]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (t.completed) return false;
      if (!selectedPriorities.has(t.priority)) return false;
      if (selectedTags.size > 0) {
        const hasMatch = t.tags?.some((tag) => selectedTags.has(tag));
        if (!hasMatch) return false;
      }
      if (availableMinutes != null && t.estimatedMinutes != null) {
        if (t.estimatedMinutes > availableMinutes) return false;
      }
      return true;
    });
  }, [tasks, selectedPriorities, selectedTags, availableMinutes]);

  const picked = pickedId ? tasks.find((t) => t.id === pickedId) : null;
  const pickedDue = picked ? formatDue(picked.dueDate) : null;

  function togglePriority(p) {
    setSelectedPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleTag(tag) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function pickFrom(pool) {
    if (spinning) return;

    if (pool.length === 0) {
      setPickedId(null);
      setEmptyNotice(true);
      return;
    }
    setEmptyNotice(false);
    setPickedId(null);

    const final = weightedPick(pool);
    const sequence = [];
    for (let i = 0; i <= SPIN_DELAYS.length; i++) {
      sequence.push(i === SPIN_DELAYS.length ? final : pool[Math.floor(Math.random() * pool.length)]);
    }

    setSpinning(true);
    setSpinDisplay(sequence[0]);
    setSpinTick((t) => t + 1);

    let idx = 0;
    const tick = () => {
      idx += 1;
      setSpinDisplay(sequence[idx]);
      setSpinTick((t) => t + 1);

      if (idx === sequence.length - 1) {
        setSpinning(false);
        setSpinDisplay(null);
        setPickedId(final.id);
        setJustLanded(true);
        return;
      }
      spinTimeoutRef.current = setTimeout(tick, SPIN_DELAYS[idx]);
    };
    spinTimeoutRef.current = setTimeout(tick, SPIN_DELAYS[0]);
  }

  function handlePick() {
    pickFrom(filtered);
  }

  function handleReroll() {
    const pool = filtered.filter((t) => t.id !== pickedId);
    pickFrom(pool.length > 0 ? pool : filtered);
  }

  function handleDoThis() {
    if (!picked || spinning) return;
    onUpdate(picked.id, { completed: true });
    setPickedId(null);
  }

  function handleNotNow() {
    if (spinning) return;
    setPickedId(null);
  }

  const deadlineInvalid = timeMode === "deadline" && deadline && availableMinutes == null;

  return (
    <div className="randomizer-view">
      <div className="filters">
        <div className="filter-group">
          <span className="filter-label">Priority</span>
          <div className="filter-chips">
            {PRIORITIES.map((p) => (
              <label key={p} className={`chip chip-${p} ${selectedPriorities.has(p) ? "chip-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={selectedPriorities.has(p)}
                  onChange={() => togglePriority(p)}
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="filter-group">
            <span className="filter-label">Tags (any of selected; none = any tag)</span>
            <div className="filter-chips">
              {allTags.map((tag) => (
                <label key={tag} className={`chip ${selectedTags.has(tag) ? "chip-active" : ""}`}>
                  <input type="checkbox" checked={selectedTags.has(tag)} onChange={() => toggleTag(tag)} />
                  {tag}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="filter-group">
          <span className="filter-label">Time available</span>
          <div className="time-mode">
            <label className={`chip ${timeMode === "none" ? "chip-active" : ""}`}>
              <input type="radio" name="timeMode" checked={timeMode === "none"} onChange={() => setTimeMode("none")} />
              No limit
            </label>
            <label className={`chip ${timeMode === "have" ? "chip-active" : ""}`}>
              <input type="radio" name="timeMode" checked={timeMode === "have"} onChange={() => setTimeMode("have")} />
              I have &nbsp;
              <input
                type="number"
                min="0"
                className="inline-number"
                disabled={timeMode !== "have"}
                value={minutesHave}
                onChange={(e) => setMinutesHave(e.target.value)}
                placeholder="minutes"
              />
              &nbsp; min
            </label>
            <label className={`chip ${timeMode === "deadline" ? "chip-active" : ""}`}>
              <input
                type="radio"
                name="timeMode"
                checked={timeMode === "deadline"}
                onChange={() => setTimeMode("deadline")}
              />
              I need to be done by &nbsp;
              <input
                type="time"
                disabled={timeMode !== "deadline"}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          </div>
          {timeMode === "deadline" && deadline && availableMinutes != null && (
            <p className="hint">That's about {formatMinutes(availableMinutes) || `${availableMinutes}m`} from now.</p>
          )}
          {deadlineInvalid && <p className="hint">Couldn't parse that time.</p>}
        </div>
      </div>

      <div className="randomizer-action">
        <button className="btn btn-primary btn-large" onClick={handlePick} disabled={spinning}>
          {spinning ? "🎲 Rolling…" : "🎲 Pick a Task"}
        </button>
        <p className="filter-count">
          {filtered.length} task{filtered.length === 1 ? "" : "s"} match{filtered.length === 1 ? "es" : ""} your
          filters
        </p>
      </div>

      {emptyNotice && !picked && !spinning && (
        <p className="empty-state">No tasks match those filters. Try loosening them up.</p>
      )}

      {spinning && spinDisplay && (
        <div className={`result-card spin-card priority-${spinDisplay.priority}`}>
          <div className="result-card-header">
            <span className={`badge badge-${spinDisplay.priority}`}>{spinDisplay.priority}</span>
          </div>
          <h2 className="result-title spin-flicker" key={spinTick}>
            {spinDisplay.title}
          </h2>
        </div>
      )}

      {!spinning && picked && (
        <div
          className={`result-card priority-${picked.priority} ${justLanded ? "landed" : ""}`}
          onAnimationEnd={() => setJustLanded(false)}
        >
          <div className="result-card-header">
            <span className={`badge badge-${picked.priority}`}>{picked.priority}</span>
            {pickedDue && <span className={`badge badge-due badge-due-${pickedDue.tone}`}>{pickedDue.label}</span>}
            {picked.estimatedMinutes && (
              <span className="badge badge-time">~{formatMinutes(picked.estimatedMinutes)}</span>
            )}
          </div>
          <h2 className="result-title">{picked.title}</h2>
          {picked.tags?.length > 0 && (
            <div className="task-item-meta">
              {picked.tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {picked.notes && <p className="result-notes">{picked.notes}</p>}

          <div className="result-actions">
            <button className="btn btn-primary" onClick={handleDoThis}>
              ✓ Do this
            </button>
            <button className="btn btn-secondary" onClick={handleReroll}>
              🎲 Reroll
            </button>
            <button className="btn btn-ghost" onClick={handleNotNow}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
