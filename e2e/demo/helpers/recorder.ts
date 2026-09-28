import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../../helpers/target.ts";

const SOURCE = path.join(REPO_ROOT, "e2e/demo/helpers/record-window.swift");
const BINARY = path.join(REPO_ROOT, "e2e/.artifacts/record-window");

let recorder: ChildProcess | null = null;

// Compiles `record-window.swift` when its binary is missing or older than the source.
function ensureRecorder(): void {
  if (existsSync(BINARY) && statSync(BINARY).mtimeMs >= statSync(SOURCE).mtimeMs) return;
  console.log("[demo] compiling record-window");
  const result = spawnSync("swiftc", ["-O", SOURCE, "-o", BINARY], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("[demo] record-window failed to compile");
}

/** The pid of the running process whose command line starts with `binary`. */
export function pidOf(binary: string): number {
  const { stdout } = spawnSync("pgrep", ["-f", `^${binary}`], { encoding: "utf8" });
  const pid = Number(stdout.trim().split("\n")[0]);
  if (!pid) throw new Error(`[demo] ${binary} is not running`);
  return pid;
}

/**
 * Records the webview of the window `pid` owns to `out` (a .mov) until `stopRecording`.
 * `webview` is its region in points, relative to the window's top-left corner.
 * It captures the window itself, so other windows may cover it. Needs Screen Recording
 * permission for the process running it.
 */
export interface Webview {
  top: number;
  width: number;
  height: number;
}

export async function startRecording(pid: number, webview: Webview, out: string) {
  if (process.platform !== "darwin") throw new Error("[demo] recording needs macOS");
  ensureRecorder();
  const child = spawn(
    BINARY,
    [pid, webview.top, webview.width, webview.height].map(String).concat(out),
    {
      stdio: ["pipe", "pipe", "inherit"]
    }
  );
  recorder = child;
  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      console.log(`[demo] ${line}`);
      if (line.startsWith("recording")) resolve();
    });
    child.once("exit", (code, signal) =>
      reject(new Error(`[demo] record-window exited with ${code ?? signal}`))
    );
  });
  child.once("exit", (code, signal) => {
    if (recorder === child) console.log(`[demo] record-window stopped early: ${code ?? signal}`);
  });
}

/** Stops the recording and waits for the file to be finished. False when none was running. */
export async function stopRecording(): Promise<boolean> {
  const child = recorder;
  recorder = null;
  if (!child || child.exitCode !== null) return false;
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  child.stdin?.end();
  const code = await exited;
  if (code !== 0) throw new Error(`[demo] record-window exited with ${code}`);
  return true;
}
