# Rolldo 🎲

A personal to-do list with a randomizer: keep a task list with priority, tags,
notes, estimated time, due dates, and recurrence, then let Rolldo pick one for
you when you can't decide what to work on next. Picks are weighted toward
higher-priority tasks and tasks whose due date is close or past.

**Live demo:** https://fkitchell.github.io/rolldo/ — the hosted version stores
tasks in your browser's `localStorage`, so your list is private to your
browser and won't sync across devices.

## Running locally

The local app runs a real Express backend that persists tasks to
`server/tasks.json`.

```bash
npm run install:all
npm run dev
```

This starts the API server on `http://localhost:3001` and the Vite dev server
on `http://localhost:5173`.

The web UI refetches the list whenever its tab regains focus, so changes made
from the CLI or MCP server show up when you switch back to it.

### Environment variables

- `ROLLDO_DATA_FILE` — path of the task file to use instead of
  `server/tasks.json`. Read by the API server, the CLI and the MCP server, so
  you can point any of them at a scratch copy for testing.
- `ROLLDO_PORT` — port for the API server (default `3001`). The Vite dev
  server reads it too, to proxy `/api` to the same port.

## Command line

`server/cli.js` reads and writes the task file directly, through the same
rules as the API, so the server doesn't need to be running. Output is JSON.

```bash
node server/cli.js list
```

| Command | What it does |
| --- | --- |
| `list [--all] [--tag T] [--priority P] [--due-within N]` | Active tasks (`--all` includes completed) |
| `find <text> [--all]` | Tasks whose title or notes contain the text |
| `add --title T [task options]` | Add a task |
| `update <id> [task options]` | Change only the given fields |
| `done <id>` / `undo <id>` | Mark complete / not complete |
| `delete <id>` | Delete a task |
| `roll [--tag T] [--priority P] [--max-minutes N]` | Pick a task, weighted by priority and due date |

Task options: `--title T`, `--priority high|medium|low`, `--tags a,b`,
`--due YYYY-MM-DD|none`, `--minutes N|none`, `--notes TEXT`,
`--repeat daily|weekly|monthly[:interval]|none`. An `<id>` can be the full id
or a unique prefix of it. `node server/cli.js --help` prints the same summary.

## Claude Desktop (MCP server)

`server/mcp.js` is a stdio MCP server that exposes the task list as tools
(`list_tasks`, `find_tasks`, `add_task`, `update_task`, `complete_task`,
`uncomplete_task`, `delete_task`, `roll_task`). It has no dependencies beyond
Node 22. To use it in Claude Desktop, open **Settings → Developer → Edit
Config** and add it to `claude_desktop_config.json`, using the absolute path
to your checkout:

```json
{
  "mcpServers": {
    "rolldo": {
      "command": "node",
      "args": ["C:\\path\\to\\rolldo\\server\\mcp.js"]
    }
  }
}
```

Restart Claude Desktop, and the Rolldo tools appear in new chats. Add
`"env": { "ROLLDO_DATA_FILE": "..." }` to the entry to point it at a
different task file.

## Tests

```bash
npm test
```

Runs the `node:test` suites (`shared/*.test.js`, `server/*.test.js`) with no
extra dependencies. CI runs them plus both client builds on every pull request.

## Building the GitHub Pages bundle

```bash
npm run build:pages --prefix client
```

This builds a fully static bundle (no backend calls) that persists tasks to
`localStorage` instead of the Express API, output to `client/dist/`. It's
deployed automatically to GitHub Pages by `.github/workflows/deploy-pages.yml`
on every push to `main`.
