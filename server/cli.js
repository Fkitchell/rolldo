#!/usr/bin/env node
// Command-line access to the task list, for scripts and the Claude Code skill.
// Works directly on tasks.json through the same rules as the API, so no server needs to be running.
import { parseArgs } from "util";
import {
  TaskError,
  listTasks,
  findTasks,
  addTask,
  updateTask,
  setCompleted,
  deleteTask,
  rollTask,
} from "./taskCommands.js";

const USAGE = `Usage: node cli.js <command> [options]

Commands:
  list [--all] [--ready] [--tag T] [--priority P] [--due-within N]
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
  --start YYYY-MM-DD|none   --blocked-by id1,id2|none

--ready leaves out tasks that are blocked or haven't started; roll always does.

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
  start: { type: "string" },
  "blocked-by": { type: "string" },
  ready: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

const TASK_FIELDS = ["title", "priority", "tags", "due", "minutes", "notes", "repeat", "start", "blocked-by"];

function taskFields(values) {
  return Object.fromEntries(
    TASK_FIELDS.filter((k) => values[k] !== undefined).map((k) => [k.replace("-", "_"), values[k]]),
  );
}

function filters(values) {
  return {
    all: values.all,
    ready: values.ready,
    tag: values.tag,
    priority: values.priority,
    dueWithin: values["due-within"],
    maxMinutes: values["max-minutes"],
  };
}

function run(argv) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, ...rest] = positionals;
  if (!command || values.help) return { usage: USAGE };

  switch (command) {
    case "list":
      return listTasks(filters(values));
    case "find":
      return findTasks(rest.join(" "), filters(values));
    case "add":
      if (values.title === undefined) throw new TaskError("--title is required");
      return addTask(taskFields(values));
    case "update":
      return updateTask(rest[0], taskFields(values));
    case "done":
      return setCompleted(rest[0], true);
    case "undo":
      return setCompleted(rest[0], false);
    case "delete":
      return deleteTask(rest[0]);
    case "roll":
      return rollTask(filters(values));
    default:
      throw new TaskError(`unknown command "${command}"\n\n${USAGE}`);
  }
}

try {
  const result = run(process.argv.slice(2));
  if (result && result.usage) console.log(result.usage);
  else console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
