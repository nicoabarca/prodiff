import type { InboxMessage, InboxSession } from "$lib/devtools/picker/types";

/** Running `channels-claude` sessions, those in this worktree first. Empty when the dev server has no inbox bridge. */
export async function listSessions(): Promise<InboxSession[]> {
  try {
    const res = await fetch("/__inbox/sessions");
    if (!res.ok) return [];
    return ((await res.json()) as { sessions: InboxSession[] }).sessions;
  } catch {
    return [];
  }
}

/** Resolves once the message is in the session. */
export async function send(sessionId: string, message: InboxMessage): Promise<void> {
  const res = await fetch("/__inbox/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, ...message })
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `HTTP ${res.status}`);
}
