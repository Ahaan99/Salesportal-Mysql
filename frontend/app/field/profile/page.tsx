"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  PROFILE_KEY,
  SUMMARY_KEY,
  saveProfile,
  type ProfileResponse,
} from "@/lib/api/field";
import { formatINR } from "@/lib/utils";
import { splitPhone, validatePhoneIntl } from "@/lib/validation/phone";
import { PhoneInput } from "@/components/forms/phone-input";

const REGIONS = ["North", "South", "East", "West"] as const;

type FormState = {
  full_name: string;
  phone_country: string;
  phone_national: string;
  city: string;
  state: string;
  region: string;
  address: string;
  photo_url: string;
  bank_name: string;
  bank_account: string;
  bank_ifsc: string;
};

const EMPTY: FormState = {
  full_name: "",
  phone_country: "IN",
  phone_national: "",
  city: "",
  state: "",
  region: "",
  address: "",
  photo_url: "",
  bank_name: "",
  bank_account: "",
  bank_ifsc: "",
};

function Field({
  id,
  label,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
        {optional && <span className="ml-1 text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function FieldProfilePage() {
  const { data, error: loadError, isLoading } = useSWR<ProfileResponse>(PROFILE_KEY, apiFetcher);
  const { mutate } = useSWRConfig();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const profile = data?.profile ?? null;
  const isNew = data !== undefined && profile === null;

  // Hydrate the form once from the server copy — later edits win.
  useEffect(() => {
    if (data === undefined || hydrated) return;
    if (data.profile) {
      const p = data.profile;
      const storedPhone = splitPhone(p.phone);
      setForm({
        full_name: p.full_name ?? "",
        phone_country: storedPhone.iso,
        phone_national: storedPhone.national,
        city: p.city ?? "",
        state: p.state ?? "",
        region: p.region ?? "",
        address: p.address ?? "",
        photo_url: p.photo_url ?? "",
        bank_name: p.bank_name ?? "",
        bank_account: p.bank_account ?? "",
        bank_ifsc: p.bank_ifsc ?? "",
      });
    }
    setHydrated(true);
  }, [data, hydrated]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFieldErrors({});
    setFormError(null);

    // Phone is optional, but if provided it must be a valid 10-digit number.
    let canonicalPhone = "";
    if (form.phone_national.trim()) {
      const check = validatePhoneIntl(form.phone_country, form.phone_national);
      if (!check.ok || !check.normalized) {
        setFieldErrors({ phone: check.error ?? "Enter a valid 10-digit number." });
        return;
      }
      canonicalPhone = check.normalized;
    }

    setSaving(true);
    try {
      const result = await saveProfile({
        full_name: form.full_name,
        phone: canonicalPhone,
        city: form.city,
        state: form.state,
        region: form.region,
        address: form.address,
        photo_url: form.photo_url,
        bank_name: form.bank_name,
        bank_account: form.bank_account,
        bank_ifsc: form.bank_ifsc,
      });
      setSaved(true);
      mutate(PROFILE_KEY, { profile: result.profile }, { revalidate: false });
      mutate(SUMMARY_KEY); // region / target may affect KPIs
      mutate("auth:me"); // sidebar / chat widgets show the (possibly renamed) user
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
        <p className="text-sm font-medium">Could not load your profile.</p>
        <p className="max-w-md text-xs text-muted-foreground">{loadError.message}</p>
      </div>
    );
  }

  if (isLoading && !data) {
    return <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {isNew ? "Create your officer profile" : "My profile"}
          </CardTitle>
          <CardDescription>
            {isNew
              ? "Set up your details once — your region places you on the leaderboard and your bank details receive commission payouts."
              : `Field officer since ${
                  profile ? new Date(profile.joined_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "—"
                }${profile?.monthly_target ? ` · monthly target ${formatINR(profile.monthly_target)}` : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <fieldset className="flex flex-col gap-4" disabled={saving}>
              <legend className="mb-1 text-sm font-medium">Personal details</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="pf-name" label="Full name" error={fieldErrors.full_name}>
                  <Input
                    id="pf-name"
                    value={form.full_name}
                    onChange={set("full_name")}
                    placeholder="e.g. Priya Sharma"
                    maxLength={120}
                    required
                    aria-invalid={!!fieldErrors.full_name}
                    aria-describedby={fieldErrors.full_name ? "pf-name-error" : undefined}
                  />
                </Field>
                <Field id="pf-phone" label="Mobile number" error={fieldErrors.phone} optional>
                  <PhoneInput
                    id="pf-phone"
                    countryIso={form.phone_country}
                    national={form.phone_national}
                    onCountryChange={(iso) => {
                      setSaved(false);
                      setFieldErrors((fe) => {
                        const next = { ...fe };
                        delete next.phone;
                        return next;
                      });
                      setForm((f) => ({ ...f, phone_country: iso }));
                    }}
                    onNationalChange={(digits) => {
                      setSaved(false);
                      setFieldErrors((fe) => {
                        const next = { ...fe };
                        delete next.phone;
                        return next;
                      });
                      setForm((f) => ({ ...f, phone_national: digits }));
                    }}
                    error={fieldErrors.phone}
                  />
                </Field>
                <Field id="pf-city" label="City" optional>
                  <Input id="pf-city" value={form.city} onChange={set("city")} placeholder="City" maxLength={120} />
                </Field>
                <Field id="pf-state" label="State" optional>
                  <Input id="pf-state" value={form.state} onChange={set("state")} placeholder="State" maxLength={120} />
                </Field>
                <Field id="pf-region" label="Region" error={fieldErrors.region} optional>
                  <select
                    id="pf-region"
                    value={form.region}
                    onChange={set("region")}
                    className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                    aria-invalid={!!fieldErrors.region}
                  >
                    <option value="">Select region…</option>
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="pf-photo" label="Photo URL" error={fieldErrors.photo_url} optional>
                  <Input
                    id="pf-photo"
                    type="url"
                    value={form.photo_url}
                    onChange={set("photo_url")}
                    placeholder="https://…"
                    maxLength={500}
                    aria-invalid={!!fieldErrors.photo_url}
                    aria-describedby={fieldErrors.photo_url ? "pf-photo-error" : undefined}
                  />
                </Field>
              </div>
              <Field id="pf-address" label="Address" error={fieldErrors.address} optional>
                <textarea
                  id="pf-address"
                  value={form.address}
                  onChange={set("address")}
                  placeholder="Street, locality, PIN code"
                  maxLength={500}
                  rows={3}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm leading-relaxed"
                  aria-invalid={!!fieldErrors.address}
                />
              </Field>
            </fieldset>

            <fieldset className="flex flex-col gap-4 border-t border-border pt-5" disabled={saving}>
              <legend className="mb-1 flex items-center gap-2 pt-5 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Payout bank account
              </legend>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Weekly commission settlements are transferred here. Stored securely and never
                shown to other officers.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="pf-bank" label="Bank name" optional>
                  <Input
                    id="pf-bank"
                    value={form.bank_name}
                    onChange={set("bank_name")}
                    placeholder="e.g. HDFC Bank"
                    maxLength={120}
                  />
                </Field>
                <Field id="pf-account" label="Account number" error={fieldErrors.bank_account} optional>
                  <Input
                    id="pf-account"
                    inputMode="numeric"
                    value={form.bank_account}
                    onChange={set("bank_account")}
                    placeholder="6-20 digits"
                    maxLength={20}
                    aria-invalid={!!fieldErrors.bank_account}
                    aria-describedby={fieldErrors.bank_account ? "pf-account-error" : undefined}
                  />
                </Field>
                <Field id="pf-ifsc" label="IFSC code" error={fieldErrors.bank_ifsc} optional>
                  <Input
                    id="pf-ifsc"
                    value={form.bank_ifsc}
                    onChange={set("bank_ifsc")}
                    placeholder="e.g. HDFC0001234"
                    maxLength={11}
                    className="uppercase"
                    aria-invalid={!!fieldErrors.bank_ifsc}
                    aria-describedby={fieldErrors.bank_ifsc ? "pf-ifsc-error" : undefined}
                  />
                </Field>
              </div>
            </fieldset>

            <div className="flex items-center gap-3 border-t border-border pt-5">
              <Button type="submit" variant="accent" disabled={saving || form.full_name.trim().length < 2}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : isNew ? (
                  "Create profile"
                ) : (
                  "Save changes"
                )}
              </Button>
              <AnimatePresence>
                {saved && (
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary"
                    role="status"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Profile saved
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {formError && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {formError}
                </motion.p>
              )}
            </AnimatePresence>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
