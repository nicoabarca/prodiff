const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 8;

/**
 * A short random id for a Group. Random rather than a counter because ids must
 * never be reused: a copied Filter List can carry `case_not_in_group(id)`.
 */
export function groupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}
