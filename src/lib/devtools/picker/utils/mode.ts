import type { PickerMode } from "$lib/devtools/picker/types";

const MODE_KEY = "prodiff.devtools.picker.mode";

/** The last mode picked, `do` when none was stored or storage is unavailable. */
export function storedMode(): PickerMode {
  try {
    return localStorage.getItem(MODE_KEY) === "ask" ? "ask" : "do";
  } catch {
    return "do";
  }
}

export function storeMode(mode: PickerMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    return;
  }
}

/** The mode a popup shortcut selects: ⌘⇧A (Ctrl+Shift+A) for Ask, ⌘⇧D (Ctrl+Shift+D) for Do. */
export function modeShortcut(event: KeyboardEvent): PickerMode | null {
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  return key === "a" ? "ask" : key === "d" ? "do" : null;
}
