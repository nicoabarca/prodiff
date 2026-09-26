const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 8;

/**
 * A short random id for a Custom Attribute. Ids are never reused: Filter Lists
 * and tree settings refer to the column `fx_{id}`.
 */
export function customAttributeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

const PREFIX = "fx_";

/** The Parquet column a Custom Attribute is written to. */
export function customAttributeColumn(id: string): string {
  return `${PREFIX}${id}`;
}
