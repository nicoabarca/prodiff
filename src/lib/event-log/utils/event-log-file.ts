/** The extensions the importer reads. */
export const EVENT_LOG_EXTENSIONS = ["csv", "xes", "xes.gz"];

/** The same extensions as the file dialog filters them, which match only a name's last one. */
export const EVENT_LOG_DIALOG_EXTENSIONS = [
  ...new Set(EVENT_LOG_EXTENSIONS.map((extension) => extension.split(".").pop() ?? extension))
];

/** Whether the importer reads the file at `path`, by its extension. */
export function isEventLogPath(path: string): boolean {
  const lower = path.toLowerCase();
  return EVENT_LOG_EXTENSIONS.some((extension) => lower.endsWith(`.${extension}`));
}

/** The last segment of a path, on either platform's separator. */
export function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
