import { randomBytes } from "crypto";

/**
 * Slug alphabet — 32 ambiguity-free chars (Crockford-ish):
 * digits + lowercase letters minus i, l, o, u. Random 8-char slug = 32^8 ≈
 * 1 trillion possibilities, collision-free in practice.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export const SLUG_LENGTH = 8;

export function generateSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

const SLUG_REGEX = /^[0-9a-hjkmnp-tv-z]{8}$/;

export function isValidSlug(s: string): boolean {
  return SLUG_REGEX.test(s);
}
