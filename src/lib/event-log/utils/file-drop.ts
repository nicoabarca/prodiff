import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

/**
 * Listens for files dropped on the window. Tauri's webview intercepts OS file
 * drops, so DOM drop events never carry paths: the drop is read off the
 * webview's own event stream. Returns the function that stops listening.
 */
export function listenForFileDrop(handlers: {
  onHover: (hovering: boolean) => void;
  onDrop: (paths: string[]) => void;
}): () => void {
  let unlisten: UnlistenFn | undefined;
  let disposed = false;

  getCurrentWebview()
    .onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        handlers.onHover(true);
      } else if (event.payload.type === "leave") {
        handlers.onHover(false);
      } else if (event.payload.type === "drop") {
        handlers.onHover(false);
        handlers.onDrop(event.payload.paths);
      }
    })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

  return () => {
    disposed = true;
    unlisten?.();
  };
}
