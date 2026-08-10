/**
 * PHONE VALIDATION (server) — mirror of frontend/lib/validation/phone.ts.
 *
 * FSOs and customers can be anywhere in the world. A number is valid when
 * it is "+<known dial code><exactly 10 digits>". Canonical stored format:
 * "+<dial><national>", e.g. "+919822014455", "+9779812345678", "+14155550123".
 *
 * Bare 10-digit numbers (no code) are accepted for backwards compatibility
 * and canonicalized under the default +91 — existing clients keep working.
 */

const PHONE_LENGTH = 10;
const DEFAULT_DIAL = "91";

/** Same set as the frontend dropdown. Sorted longest-first at build time. */
const DIAL_CODES = [
  "1", "7", "20", "27", "31", "33", "34", "39", "44", "49", "52", "55",
  "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90",
  "91", "92", "94", "95", "234", "254", "880", "966", "971", "974", "977",
].sort((a, b) => b.length - a.length);

/**
 * Validates and canonicalizes a phone number.
 * Returns { ok, value } — value is null for empty input (caller decides
 * whether empty is allowed). Never throws.
 */
function normalizePhone(raw) {
  const stripped = String(raw ?? "").replace(/[\s().-]/g, "");
  if (!stripped) return { ok: true, value: null };
  if (!/^\+?[0-9]+$/.test(stripped)) return { ok: false };

  const hadPlus = stripped.startsWith("+");
  let digits = stripped.replace(/^\+/, "");

  if (hadPlus) {
    // International form: longest matching dial code + exactly 10 digits.
    const dial = DIAL_CODES.find(
      (d) => digits.startsWith(d) && digits.length === d.length + PHONE_LENGTH
    );
    if (!dial) return { ok: false };
    const national = digits.slice(dial.length);
    if (national.startsWith("0")) return { ok: false };
    return { ok: true, value: `+${dial}${national}` };
  }

  // Legacy national forms (assumed default country):
  if (digits.length === PHONE_LENGTH + 1 && digits.startsWith("0")) {
    digits = digits.slice(1); // trunk prefix 0XXXXXXXXXX
  } else if (
    digits.length === DEFAULT_DIAL.length + PHONE_LENGTH &&
    digits.startsWith(DEFAULT_DIAL)
  ) {
    digits = digits.slice(DEFAULT_DIAL.length); // 91XXXXXXXXXX without "+"
  }
  if (digits.length !== PHONE_LENGTH || digits.startsWith("0")) return { ok: false };
  return { ok: true, value: `+${DEFAULT_DIAL}${digits}` };
}

const PHONE_ERROR =
  "Enter a valid phone number: country code plus exactly 10 digits.";

module.exports = { normalizePhone, PHONE_LENGTH, PHONE_ERROR };
