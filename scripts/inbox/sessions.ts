import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import type { InboxSession } from "../../src/lib/devtools/picker/types";

/** Where Claude Inbox channels register, one `<id>.json` per running session. */
export const REGISTRY_DIR = join(homedir(), ".claude", "channels", "inbox", "sessions");

export interface RegistryEntry {
  v: 1;
  id: string;
  pid: number;
  port: number;
  token: string;
  cwd: string;
  project: string;
  startedAt: number;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Registry entries (format v1) of running channels, newest first. Unreadable files are skipped. */
export function liveChannels(dir = REGISTRY_DIR): RegistryEntry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: RegistryEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const entry = JSON.parse(readFileSync(join(dir, name), "utf8")) as RegistryEntry;
      if (entry.v === 1 && alive(entry.pid)) out.push(entry);
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

/** True when the session runs in `root` or a folder below it. */
export function inWorktree(cwd: string, root: string): boolean {
  const base = root.endsWith(sep) ? root.slice(0, -1) : root;
  return cwd === base || cwd.startsWith(base + sep);
}

/** What the page may see of each session (never its port or token), sessions in `root` first. */
export function describeSessions(entries: RegistryEntry[], root: string): InboxSession[] {
  return entries
    .map(({ id, project, cwd, startedAt }) => ({ id, project, cwd, startedAt, matches: inWorktree(cwd, root) }))
    .sort((a, b) => Number(b.matches) - Number(a.matches));
}
