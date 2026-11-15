/**
 * Normalize a keyboard event into the key string the drill engine expects.
 *
 * Numpad digits report `e.key` as "0"–"9" only while NumLock is on; with
 * NumLock off they report navigation keys ("End", "ArrowDown", "Insert", …).
 * `e.code` ("Numpad0"–"Numpad9") is stable regardless, so prefer it.
 * NumpadEnter already reports "Enter" but is mapped explicitly for safety.
 */
export function normalizeKey(e: KeyboardEvent): string {
  const m = /^Numpad([0-9])$/.exec(e.code);
  if (m) return m[1];
  if (e.code === "NumpadEnter") return "Enter";
  return e.key;
}
