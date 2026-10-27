import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ROLLDO_DATA_FILE lets the CLI be pointed at a scratch copy for testing.
const DATA_FILE = process.env.ROLLDO_DATA_FILE || path.join(__dirname, "tasks.json");

export function readTasks() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, "utf-8").trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Don't fall back to [] — the next write would wipe the file.
    throw new Error(`${DATA_FILE} is not valid JSON (${err.message}); fix or restore it before continuing`);
  }
}

// Write to a temp file and rename it over the original, so a crash mid-write can't leave a half-written file.
export function writeTasks(tasks) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
