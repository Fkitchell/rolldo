export function formatMinutes(minutes) {
  if (!minutes) return null;
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60}h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function formatRecurrence(recurrence) {
  if (!recurrence) return null;
  const { frequency, interval } = recurrence;
  if (interval === 1) return frequency === "daily" ? "Daily" : frequency === "weekly" ? "Weekly" : "Monthly";
  const unit = frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : "months";
  return `Every ${interval} ${unit}`;
}
