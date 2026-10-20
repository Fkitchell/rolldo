#!/usr/bin/env node
// MCP server (stdio) exposing the task list as tools, for Claude Desktop chats and Claude Code.
// Speaks newline-delimited JSON-RPC 2.0 directly, so it needs no extra dependencies.
// Anything written to stdout must be a protocol message — log to stderr only.
import readline from "readline";
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

const SERVER_INFO = { name: "rolldo", version: "1.0.0" };
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

const INSTRUCTIONS = `Rolldo is the user's personal task list / to-do list.
- Turn relative dates ("Friday", "tomorrow", "in 2 weeks") into YYYY-MM-DD from today's date. "Friday" means the next Friday that hasn't passed.
- Recurrence: "every week" -> weekly, "every 2 weeks" -> weekly:2, "quarterly" -> monthly:3.
- Priority: "urgent"/"important"/"asap" -> high, "someday"/"whenever" -> low; otherwise leave it unset (medium).
- Before changing a task the user named in words, call find_tasks to get its id. If several match, ask which one.
- Always confirm with the user before delete_task.
- Reply with a short readable list (title, priority if not medium, dueLabel, repeat, tags), not raw JSON.`;

const FILTER_PROPS = {
  tag: { type: "string", description: "Only tasks with this tag (case-insensitive)" },
  priority: { type: "string", enum: ["high", "medium", "low"] },
};

const TASK_PROPS = {
  priority: { type: "string", enum: ["high", "medium", "low"] },
  tags: { type: "array", items: { type: "string" } },
  due: { type: "string", description: "Due date as YYYY-MM-DD, or \"none\" to clear it" },
  minutes: { type: ["number", "string"], description: "Time estimate in minutes, or \"none\" to clear it" },
  notes: { type: "string" },
  repeat: {
    type: "string",
    description: "daily, weekly or monthly, optionally with an interval (weekly:2 = every 2 weeks), or \"none\"",
  },
};

const ID_PROP = { id: { type: "string", description: "Task id, or a unique prefix of it (8 characters is plenty)" } };

const TOOLS = [
  {
    name: "list_tasks",
    description: "List tasks, earliest due date first. Open tasks only unless `all` is true.",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Include completed tasks" },
        ...FILTER_PROPS,
        dueWithin: { type: "number", description: "Only tasks due within this many days (0 = today or overdue)" },
      },
    },
    annotations: { readOnlyHint: true },
    run: (args) => listTasks(args),
  },
  {
    name: "find_tasks",
    description: "Search open tasks by text in the title or notes. Use it to turn a task the user describes into an id.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, all: { type: "boolean", description: "Include completed tasks" } },
      required: ["text"],
    },
    annotations: { readOnlyHint: true },
    run: ({ text, ...filters }) => findTasks(text, filters),
  },
  {
    name: "add_task",
    description: "Add a task to the list.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, ...TASK_PROPS },
      required: ["title"],
    },
    run: (args) => addTask(args),
  },
  {
    name: "update_task",
    description: "Change a task's fields. Only the fields you pass are changed.",
    inputSchema: {
      type: "object",
      properties: { ...ID_PROP, title: { type: "string" }, ...TASK_PROPS },
      required: ["id"],
    },
    run: ({ id, ...fields }) => updateTask(id, fields),
  },
  {
    name: "complete_task",
    description: "Mark a task done. A repeating task rolls its due date forward and comes back when it's next due.",
    inputSchema: { type: "object", properties: ID_PROP, required: ["id"] },
    run: ({ id }) => setCompleted(id, true),
  },
  {
    name: "uncomplete_task",
    description: "Mark a completed task as not done, restoring its previous due date.",
    inputSchema: { type: "object", properties: ID_PROP, required: ["id"] },
    run: ({ id }) => setCompleted(id, false),
  },
  {
    name: "delete_task",
    description: "Permanently delete a task. Confirm with the user first.",
    inputSchema: { type: "object", properties: ID_PROP, required: ["id"] },
    annotations: { destructiveHint: true },
    run: ({ id }) => deleteTask(id),
  },
  {
    name: "roll_task",
    description:
      "Pick one open task at random, weighted by priority and due-date urgency (the app's randomizer). Returns null if nothing matches.",
    inputSchema: {
      type: "object",
      properties: {
        ...FILTER_PROPS,
        maxMinutes: { type: "number", description: "Skip tasks estimated to take longer than this" },
      },
    },
    annotations: { readOnlyHint: true },
    run: (args) => rollTask(args),
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function callTool({ name, arguments: args = {} }) {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  try {
    const result = tool.run(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    if (!(err instanceof TaskError)) console.error(err);
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

function handle(request) {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: request.params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ run, ...tool }) => tool) };
    case "tools/call":
      return callTool(request.params ?? {});
    default:
      return undefined;
  }
}

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  // Notifications (no id) need no reply.
  if (request.id === undefined || request.id === null) return;
  const result = handle(request);
  if (result === undefined) {
    send({ id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } });
  } else {
    send({ id: request.id, result });
  }
});
