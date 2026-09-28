import type { ProjectDraft } from "$lib/event-log/types";

/** A file picked outside the new-project flow, which the flow opens on. */
const pending = $state<{ draft: ProjectDraft | null }>({ draft: null });

export function setPendingUpload(draft: ProjectDraft) {
  pending.draft = draft;
}

/** The pending file, cleared as it is read. */
export function takePendingUpload(): ProjectDraft | null {
  const draft = pending.draft;
  pending.draft = null;
  return draft;
}
