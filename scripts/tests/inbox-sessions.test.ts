import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeSessions, inWorktree, liveChannels, type RegistryEntry } from "../inbox/sessions";

const entry = (over: Partial<RegistryEntry>): RegistryEntry => ({
  v: 1,
  id: "a",
  pid: process.pid,
  port: 1,
  token: "t",
  cwd: "/repo",
  project: "repo",
  startedAt: 1,
  ...over
});

describe("inWorktree", () => {
  it("matches the root and folders below it", () => {
    expect(inWorktree("/w/repo", "/w/repo")).toBe(true);
    expect(inWorktree("/w/repo/src", "/w/repo")).toBe(true);
    expect(inWorktree("/w/repo/src", "/w/repo/")).toBe(true);
  });

  it("does not match siblings with a shared prefix or parents", () => {
    expect(inWorktree("/w/repo-2", "/w/repo")).toBe(false);
    expect(inWorktree("/w", "/w/repo")).toBe(false);
  });
});

describe("describeSessions", () => {
  it("puts sessions in the worktree first and hides port and token", () => {
    const sessions = describeSessions(
      [entry({ id: "other", cwd: "/elsewhere" }), entry({ id: "here", cwd: "/repo/src" })],
      "/repo"
    );
    expect(sessions.map((s) => [s.id, s.matches])).toEqual([
      ["here", true],
      ["other", false]
    ]);
    expect(sessions[0]).not.toHaveProperty("token");
    expect(sessions[0]).not.toHaveProperty("port");
  });
});

describe("liveChannels", () => {
  it("keeps v1 entries of running processes, newest first", () => {
    const dir = mkdtempSync(join(tmpdir(), "inbox-"));
    writeFileSync(join(dir, "old.json"), JSON.stringify(entry({ id: "old", startedAt: 1 })));
    writeFileSync(join(dir, "new.json"), JSON.stringify(entry({ id: "new", startedAt: 2 })));
    writeFileSync(join(dir, "dead.json"), JSON.stringify(entry({ id: "dead", pid: 2 ** 22 + 7 })));
    writeFileSync(join(dir, "v2.json"), JSON.stringify({ ...entry({ id: "v2" }), v: 2 }));
    writeFileSync(join(dir, "broken.json"), "{");
    expect(liveChannels(dir).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("is empty when the registry does not exist", () => {
    expect(liveChannels(join(tmpdir(), "no-such-inbox-dir"))).toEqual([]);
  });
});
