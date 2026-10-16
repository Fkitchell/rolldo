const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDueDate(dueDate) {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return null;
  return new Date(y, m - 1, d);
}

// Whole calendar days from today until the due date — negative when overdue, null with no date.
export function daysUntilDue(dueDate) {
  const due = parseDueDate(dueDate);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / MS_PER_DAY);
}

export function formatDue(dueDate) {
  const days = daysUntilDue(dueDate);
  if (days == null) return null;
  if (days < 0) return { label: `Overdue ${-days}d`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  const label = parseDueDate(dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { label: `Due ${label}`, tone: days <= 3 ? "soon" : "later" };
}

// Extra pick odds for tasks with a looming deadline, multiplied onto the priority weight.
export function urgencyMultiplier(task) {
  const days = daysUntilDue(task.dueDate);
  if (days == null) return 1;
  if (days < 0) return 2;
  if (days === 0) return 1.75;
  if (days <= 3) return 1.4;
  if (days <= 7) return 1.15;
  return 1;
}

// Sort comparator: earliest due date first, tasks without one last.
export function compareDueDates(a, b) {
  if (a.dueDate === b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}
