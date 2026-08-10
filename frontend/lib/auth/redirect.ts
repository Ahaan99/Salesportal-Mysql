/**
 * Open-redirect protection for the post-login "next" destination.
 *
 * A raw `next.startsWith("/")` check is NOT enough:
 *   - "//evil.com"        -> protocol-relative external redirect
 *   - "/\\evil.com"       -> backslash trick some browsers normalize to "//"
 *   - "/%2F%2Fevil.com"   -> encoded slashes that decode to "//"
 *   - "/auth/login"       -> redirect loop back into the login page
 *
 * Only clean, same-origin, absolute paths survive. Anything suspicious
 * falls back to `null` so the caller can use the role-based home instead.
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;

  let value = raw.trim();
  if (!value) return null;

  // Decode once to catch %2F / %5C smuggling; a malformed sequence is hostile.
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }

  // Must be an absolute path on THIS origin: exactly one leading "/".
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  // No schemes, no backslashes, no CR/LF header-splitting, no null bytes.
  if (/[\\\r\n\u0000]/.test(value)) return null;
  if (/^\/*(?:https?|javascript|data|vbscript):/i.test(value)) return null;

  // Never bounce back into auth pages (redirect loops).
  if (value === "/auth/login" || value.startsWith("/auth/")) return null;

  // Cap length — nobody has a legitimate 2KB deep-link.
  if (value.length > 512) return null;

  return value;
}
