import { Channel, invoke } from "@tauri-apps/api/core";
import type { ReadProgress, ResponseEventLogPreview } from "$lib/event-log/invokers/types";

/** `onProgress` hears how much of the file has been read while an XES is converted. */
export function fetchEventLogPreview(
  filePath: string,
  onProgress: (progress: ReadProgress) => void = () => {}
): Promise<ResponseEventLogPreview> {
  const channel = new Channel<ReadProgress>();
  channel.onmessage = onProgress;
  return invoke<ResponseEventLogPreview>("preview_event_log", {
    path: filePath,
    onProgress: channel
  });
}
