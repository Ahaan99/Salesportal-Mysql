/**
 * PHONE VALIDATION — single source of truth for phone rules.
 *
 * FSOs and customers can be anywhere in the world, so numbers carry a
 * selectable country dial code. Rule: the national number is digits
 * only, EXACTLY 10 digits. Canonical stored format: "+<dial><10 digits>"
 * (no spaces or separators), e.g. "+919822014455", "+9779812345678".
 */

export const PHONE_LENGTH = 10;

export interface Country {
  /** ISO 3166-1 alpha-2, used as a stable option key. */
  iso: string;
  name: string;
  /** Dial code digits WITHOUT the leading "+". */
  dial: string;
}

/**
 * Sorted by name. Dial codes are unique per entry except shared codes
 * (+1, +7, +44 …) where the primary country is listed first so
 * splitPhone() resolves stored numbers deterministically.
 */
export const COUNTRIES: Country[] = [
  { iso: "IN", name: "India", dial: "91" },
  { iso: "NP", name: "Nepal", dial: "977" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "CN", name: "China", dial: "86" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "EG", name: "Egypt", dial: "20" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "KR", name: "South Korea", dial: "82" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "MM", name: "Myanmar", dial: "95" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "RU", name: "Russia", dial: "7" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "TR", name: "Turkey", dial: "90" },
  { iso: "VN", name: "Vietnam", dial: "84" },
  { iso: "ZA", name: "South Africa", dial: "27" },
];

/** Default country for new inputs. */
export const DEFAULT_COUNTRY_ISO = "IN";

export function countryByIso(iso: string): Country {
  return COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];
}

/** Legacy alias kept for existing imports (was the +91 constant). */
export const COUNTRY_CODE = "91";
/** Max input length for a bare national number. */
export const MAX_PHONE_INPUT_LENGTH = PHONE_LENGTH;

export interface PhoneValidationResult {
  ok: boolean;
  /** Canonical "+<dial><national>" when ok. */
  normalized?: string;
  error?: string;
}

/**
 * Keystroke-level sanitizer for the NATIONAL number input:
 * digits only, hard-capped at 10. Pasted separators are dropped;
 * a pasted leading "0" trunk prefix on an 11-digit paste is removed.
 */
/**
 * Zero-digit code points of common numeral systems, so digits typed on
 * Devanagari/Arabic/Bengali/fullwidth keyboards are converted to ASCII
 * instead of being silently deleted (which looks like "I can't type").
 */
const ZERO_BASES = [
  0x0030, // ASCII 0-9
  0x0660, // Arabic-Indic
  0x06f0, // Extended Arabic-Indic (Persian/Urdu)
  0x0966, // Devanagari (Hindi/Nepali/Marathi)
  0x09e6, // Bengali
  0x0a66, // Gurmukhi (Punjabi)
  0x0ae6, // Gujarati
  0x0b66, // Odia
  0x0be6, // Tamil
  0x0c66, // Telugu
  0x0ce6, // Kannada
  0x0d66, // Malayalam
  0xff10, // Fullwidth (CJK IME)
];

/** Converts any supported Unicode decimal digit to its ASCII equivalent. */
function toAsciiDigits(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    const base = ZERO_BASES.find((z) => cp >= z && cp <= z + 9);
    out += base !== undefined ? String(cp - base) : ch;
  }
  return out;
}

export function sanitizeNationalInput(raw: string): string {
  let digits = toAsciiDigits(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === PHONE_LENGTH + 1 && digits.startsWith("0")) {
    digits = digits.slice(1); // trunk prefix: 09822014455 -> 9822014455
  }
  return digits.slice(0, PHONE_LENGTH);
}

/** Legacy alias — older pages import sanitizePhoneInput. */
export const sanitizePhoneInput = sanitizeNationalInput;

/**
 * Validates a national number against the selected country and returns
 * the canonical international form.
 */
export function validatePhoneIntl(
  countryIso: string,
  national: string
): PhoneValidationResult {
  const country = countryByIso(countryIso);
  const digits = (national ?? "").replace(/[^0-9]/g, "");

  if (!digits) return { ok: false, error: "Phone number is required." };
  if (digits !== (national ?? "").trim()) {
    // Input contained non-digit characters the user typed manually.
    return { ok: false, error: "Phone number must contain digits only." };
  }
  if (digits.length !== PHONE_LENGTH) {
    return { ok: false, error: `Enter exactly ${PHONE_LENGTH} digits.` };
  }
  if (digits.startsWith("0")) {
    return { ok: false, error: "Do not include the leading 0 — enter the 10-digit number only." };
  }
  return { ok: true, normalized: `+${country.dial}${digits}` };
}

/**
 * Splits a stored canonical number "+<dial><national>" back into
 * { iso, national } for form editing. Longest dial code wins; totally
 * unknown prefixes fall back to the default country with the raw digits.
 */
export function splitPhone(stored: string | null | undefined): {
  iso: string;
  national: string;
} {
  const raw = (stored ?? "").replace(/[^0-9+]/g, "");
  if (!raw) return { iso: DEFAULT_COUNTRY_ISO, national: "" };
  const digits = raw.replace(/^\+/, "");

  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial) && digits.length === c.dial.length + PHONE_LENGTH);

  if (match) return { iso: match.iso, national: digits.slice(match.dial.length) };
  // Bare 10-digit number stored without a code (legacy rows).
  if (digits.length === PHONE_LENGTH) return { iso: DEFAULT_COUNTRY_ISO, national: digits };
  return { iso: DEFAULT_COUNTRY_ISO, national: digits.slice(-PHONE_LENGTH) };
}

/**
 * Legacy whole-string validator kept for back-compat. Accepts any
 * known "+<dial>" prefix (or a bare 10-digit number, assumed default
 * country) and returns the canonical international form.
 */
export function validatePhone(raw: string): PhoneValidationResult {
  const stripped = (raw ?? "").replace(/[\s().-]/g, "");
  if (!stripped) return { ok: false, error: "Phone number is required." };
  if (!/^\+?[0-9]+$/.test(stripped)) {
    return { ok: false, error: "Phone number must contain digits only." };
  }
  const { iso, national } = splitPhone(stripped);
  if (national.length !== PHONE_LENGTH) {
    return { ok: false, error: `Enter exactly ${PHONE_LENGTH} digits after the country code.` };
  }
  return validatePhoneIntl(iso, national);
}
