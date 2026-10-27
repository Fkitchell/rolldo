import { urgencyMultiplier } from "./dueDates.js";

// Relative odds of a task being picked — a high task is 1.5x as likely as a low one.
// A looming due date multiplies these further (see urgencyMultiplier).
export const PRIORITY_WEIGHTS = { high: 1.5, medium: 1.25, low: 1 };

export function weightedPick(pool) {
  const weightOf = (t) => (PRIORITY_WEIGHTS[t.priority] ?? PRIORITY_WEIGHTS.medium) * urgencyMultiplier(t);
  const total = pool.reduce((sum, t) => sum + weightOf(t), 0);
  let r = Math.random() * total;
  for (const t of pool) {
    r -= weightOf(t);
    if (r < 0) return t;
  }
  return pool[pool.length - 1];
}
