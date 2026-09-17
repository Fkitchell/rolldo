# Rolldo 🎲

A personal to-do list with a randomizer: keep a task list with priority, tags,
notes, estimated time, and recurrence, then let Rolldo pick one for you when
you can't decide what to work on next.

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

## Building the GitHub Pages bundle

```bash
npm run build:pages --prefix client
```

This builds a fully static bundle (no backend calls) that persists tasks to
`localStorage` instead of the Express API, output to `client/dist/`. It's
deployed automatically to GitHub Pages by `.github/workflows/deploy-pages.yml`
on every push to `main`.
