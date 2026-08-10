"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import {
  COUNTRIES,
  PHONE_LENGTH,
  countryByIso,
  sanitizeNationalInput,
} from "@/lib/validation/phone";

/**
 * International phone input: country-code dropdown + 10-digit national
 * number field.
 *
 * - The dropdown lists every supported country as "Name (+dial)".
 * - The number field accepts DIGITS ONLY (sanitized on every keystroke,
 *   including paste), hard-capped at 10 digits.
 * - Fully controlled: the parent owns `countryIso` and `national` and
 *   builds the canonical "+<dial><national>" with validatePhoneIntl()
 *   at submit time.
 */
export interface PhoneInputProps {
  id?: string;
  countryIso: string;
  national: string;
  onCountryChange: (iso: string) => void;
  onNationalChange: (digits: string) => void;
  error?: string | null;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function PhoneInput({
  id,
  countryIso,
  national,
  onCountryChange,
  onNationalChange,
  error,
  hint,
  required,
  disabled,
  placeholder = "10-digit number",
}: PhoneInputProps) {
  const autoId = useId();
  const inputId = id ?? `phone-${autoId}`;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;
  const dial = countryByIso(countryIso).dial;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${inputId}-country`} className="sr-only">
          Country code
        </label>
        <select
          id={`${inputId}-country`}
          value={countryIso}
          onChange={(e) => onCountryChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-[132px] shrink-0 rounded-lg border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.name} (+{c.dial})
            </option>
          ))}
        </select>
        <div className="relative min-w-[180px] flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
          >
            +{dial}
          </span>
          <Input
            id={inputId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={national}
            onChange={(e) => onNationalChange(sanitizeNationalInput(e.target.value))}
            placeholder={placeholder}
            maxLength={PHONE_LENGTH + 2} /* paste headroom; sanitizer caps at 10 */
            required={required}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`${dial.length >= 3 ? "pl-14" : dial.length === 2 ? "pl-12" : "pl-10"} ${error ? "border-destructive" : ""}`}
          />
        </div>
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
