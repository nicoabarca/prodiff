/** The alphabet and length of a Group id: eight base62 characters. */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 8;

/**
 * A short random id for a Group. Short because it is repeated once per Group
 * per node in every tree payload, and random rather than a counter because ids
 * must never be reused — a copied Filter List can carry
 * `case_not_in_group(id)`, and a reissued id would silently point it at a
 * different set of cases.
 *
 * 62^8 is about 2.2e14, so a collision inside one project is not a real event,
 * and the primary key would reject one anyway.
 */
export function groupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}
