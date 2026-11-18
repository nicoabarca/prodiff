/** The longest Project or Group name, in characters. */
export const NAME_MAX_LENGTH = 40;

/** A name as stored: trimmed and cut to `NAME_MAX_LENGTH`. Empty when nothing is left. */
export function cleanName(name: string): string {
  return name.trim().slice(0, NAME_MAX_LENGTH).trimEnd();
}
