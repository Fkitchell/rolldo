#!/usr/bin/env node
// Command-line access to the task list, for scripts and the Claude Code skill.
// Works directly on tasks.json through the same rules as the API, so no server needs to be running.
import crypto from "crypto";
import { parseArgs } from "util";
import { readTasks, writeTasks, reactivateDueTasks, sanitizeTaskInput } from "./taskLogic.js";
import { compareDueDates, daysUntilDue, formatDue, urgencyMultiplier } from "../client/src/dueDates.js";

// Mirrors PRIORITY_WEIGHTS in client/src/components/Randomizer.jsx — keep the two in sync.
const PRIORITY_WEIGHTS = { high: 1.5, medium: 1.25, low: 1 };

const USAGE = `Usage: node cli.js <command> [options]

Commands:
  list [--all] [--tag T] [--priority P] [--due-within N]
  find <text> [--all]
  add --title T [task options]
  update <id> [--title T] [task options]
  done <id>
  undo <id>
  delete <id>
  roll [--tag T] [--priority P] [--max-minutes N]

Task options:
  --priority high|medium|low   --tags a,b   --due YYYY-MM-DD|none
  --minutes N|none   --notes TEXT   --repeat daily|weekly|monthly[:interval]|none

<id> may be the full id or a unique prefix of it. Output is JSON.`;

const OPTIONS = {
  all: { type: "boolean" },
  tag: { type: "string" },
  priority: { type: "string" },
  "due-within": { type: "string" },
  "max-minutes": { type: "string" },
  title: { type: "string" },
  tags: { type: "string" },
  due: { type: "string" },
  minutes: { type: "string" },
  notes: { type: "string" },
  repeat: { type: "string" },
  help: { type: "boolean", short: "h" },
};

class CliError extends Error {}

function fail(message) {
  throw new CliError(message);
}

function parseRepeat(value) {
  if (value === "none") return null;
  const [frequency, interval = "1"] = value.split(":");
  if (!["daily", "weekly", "monthly"].includes(frequency)) fail(`invalid --repeat "${value}"`);
  const n = Number(interval);
  if (!Number.isInteger(n) || n < 1) fail(`invalid --repeat interval "${interval}"`);
  return { frequency, interval: n };
}

// Turns CLI flags into the request body shape sanitizeTaskInput expects.
function bodyFromFlags(values) {
  const body = {};
  if (values.title !== undefined) body.title = values.title;
  if (values.priority !== undefined) {
    if (!["high", "medium", "low"].includes(values.priority)) fail(`invalid --priority "${values.priority}"`);
    body.priority = values.priority;
  }
  if (values.tags !== undefined) body.tags = values.tags.split(",").filter((t) => t.trim());
  if (values.notes !== undefined) body.notes = values.notes;
  if (values.minutes !== undefined) body.estimatedMinutes = values.minutes === "none" ? null : values.minutes;
  if (values.repeat !== undefined) body.recurrence = parseRepeat(values.repeat);
  if (values.due !== undefined) {
    if (values.due !== "none" && !/^\d{4}-\d{2}-\d{2}$/.test(values.due)) fail(`invalid --due "${values.due}"`);
    body.dueDate = values.due === "none" ? null : values.due;
  }
  return body;
}

function present(task) {
  return {
    ...task,
    daysUntilDue: daysUntilDue(task.dueDate),
    dueLabel: formatDue(task.dueDate)?.label ?? null,
  };
}

function filterTasks(tasks, values) {
  let result = values.all ? tasks : tasks.filter((t) => !t.completed);
  if (values.tag) {
    const tag = values.tag.toLowerCase();
    result = result.filter((t) => t.tags.some((x) => x.toLowerCase() === tag));
  }
  if (values.priority) result = result.filter((t) => t.priority === values.priority);
  if (values["due-within"] !== undefined) {
    const n = Number(values["due-within"]);
    result = result.filter((t) => t.dueDate && daysUntilDue(t.dueDate) <= n);
  }
  if (values["max-minutes"] !== undefined) {
    const n = Number(values["max-minutes"]);
    result = result.filter((t) => t.estimatedMinutes == null || t.estimatedMinutes <= n);
  }
  return result;
}

function findIndex(tasks, id) {
  if (!id) fail("a task id is required");
  const matches = tasks.map((t, i) => [t, i]).filter(([t]) => t.id.startsWith(id));
  if (matches.length === 0) fail(`task not found: ${id}`);
  if (matches.length > 1) fail(`id prefix "${id}" matches ${matches.length} tasks; use more characters`);
  return matches[0][1];
}

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

function run(argv) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, ...rest] = positionals;
  if (!command || values.help) return { usage: USAGE };

  const tasks = readTasks();
  let changed = reactivateDueTasks(tasks);
  let result;

  switch (command) {
    case "list":
      result = filterTasks(tasks, values).sort(compareDueDates).map(present);
      break;

    case "find": {
      const text = rest.join(" ").toLowerCase();
      if (!text) fail("find needs some text to search for");
      result = filterTasks(tasks, values)
        .filter((t) => t.title.toLowerCase().includes(text) || t.notes.toLowerCase().includes(text))
        .map(present);
      break;
    }

    case "add": {
      const body = bodyFromFlags(values);
      if (typeof body.title !== "string" || !body.title.trim()) fail("--title is required");
      const task = { id: crypto.randomUUID(), ...sanitizeTaskInput(body), createdAt: new Date().toISOString() };
      tasks.push(task);
      changed = true;
      result = present(task);
      break;
    }

    case "update":
    case "done":
    case "undo": {
      const idx = findIndex(tasks, rest[0]);
      const body = command === "update" ? bodyFromFlags(values) : { completed: command === "done" };
      if (body.title !== undefined && !body.title.trim()) fail("--title cannot be empty");
      tasks[idx] = { ...tasks[idx], ...sanitizeTaskInput(body, tasks[idx]) };
      changed = true;
      result = present(tasks[idx]);
      break;
    }

    case "delete": {
      const idx = findIndex(tasks, rest[0]);
      const [removed] = tasks.splice(idx, 1);
      changed = true;
      result = present(removed);
      break;
    }

    case "roll": {
      const pool = filterTasks(tasks, { ...values, all: false });
      result = pool.length ? present(weightedPick(pool)) : null;
      break;
    }

    default:
      fail(`unknown command "${command}"\n\n${USAGE}`);
  }

  if (changed) writeTasks(tasks);
  return result;
}

try {
  const result = run(process.argv.slice(2));
  if (result && result.usage) console.log(result.usage);
  else console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
