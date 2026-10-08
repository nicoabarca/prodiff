// Dev-server bridge between the element picker and Claude Code sessions that
// run the Claude Inbox channel (`channels-claude`).
//
//   GET  /__inbox/sessions                       -> { sessions: InboxSession[] }
//   POST /__inbox/send { sessionId, text, meta } -> the channel's /send answer
//
// The page never sees a channel's port or token. Only pages of this dev
// server may post: browsers always send Origin on POST and other origins
// cannot fake it.

import type { IncomingMessage, ServerResponse } from "node:http";
import { request } from "node:http";
import type { Plugin } from "vite";
import { describeSessions, liveChannels, type RegistryEntry } from "./sessions";

const MAX_BODY = 1024 * 1024;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request too large."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** POSTs to a channel's /send and resolves with its status and JSON body. */
function sendToChannel(
  channel: RegistryEntry,
  payload: unknown,
  signal: AbortSignal
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: channel.port,
        path: "/send",
        method: "POST",
        headers: { Authorization: `Bearer ${channel.token}`, "Content-Type": "application/json" },
        signal
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 502, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch {
            reject(new Error("Invalid answer from the channel."));
          }
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(payload));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, root: string) {
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && path === "/__inbox/sessions") {
    return sendJson(res, 200, { sessions: describeSessions(liveChannels(), root) });
  }

  if (req.method !== "POST" || path !== "/__inbox/send") return sendJson(res, 404, { error: "Not found." });
  if (req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: "Forbidden." });

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: (error as Error).message });
  }
  const channel = liveChannels().find((entry) => entry.id === body.sessionId);
  if (!channel) return sendJson(res, 404, { error: "That Claude session is no longer running." });

  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    const answer = await sendToChannel(channel, { text: body.text, meta: body.meta }, abort.signal);
    return sendJson(res, answer.status, answer.body);
  } catch (error) {
    if (abort.signal.aborted) return;
    return sendJson(res, 502, { error: `Could not reach the Claude session: ${(error as Error).message}` });
  }
}

/** Serves /__inbox/* from `vite dev` only. */
export function claudeInbox(): Plugin {
  let root = "";
  return {
    name: "claude-inbox",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__inbox/")) return next();
        handle(req, res, root).catch((error: Error) => {
          if (!res.headersSent) sendJson(res, 500, { error: error.message });
          else res.end();
        });
      });
    }
  };
}
