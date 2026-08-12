"use client";

import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Landmark, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useVendorStore } from "@/lib/store/vendor-store";
import { countryByIso, splitPhone } from "@/lib/validation/phone";
import { PhoneInput } from "@/components/forms/phone-input";
import type { CompanyProfile } from "@/lib/types";

type Field = {
  key: keyof CompanyProfile;
  label: string;
  placeholder?: string;
  textarea?: boolean;
  hint?: string;
};

const SECTIONS: { title: string; description: string; icon: typeof Building2; fields: Field[] }[] = [
  {
    title: "Company",
    description: "How your brand appears across the marketplace",
    icon: Building2,
    fields: [
      { key: "companyName", label: "Brand name" },
      { key: "legalName", label: "Legal entity name" },
      { key: "tagline", label: "Tagline", placeholder: "One line about your brand" },
      { key: "about", label: "About", textarea: true },
      { key: "website", label: "Website", placeholder: "https://" },
    ],
  },
  {
    title: "Contact",
    description: "Primary business contact for orders and support",
    icon: MapPin,
    fields: [
      { key: "contactName", label: "Contact person" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone", hint: "Select the country code, then enter the 10-digit number." },
      { key: "addressLine", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "pincode", label: "PIN code" },
    ],
  },
  {
    title: "Compliance",
    description: "Verified against government registries during review",
    icon: ShieldCheck,
    fields: [
      { key: "gstin", label: "GSTIN", hint: "15-character GST number" },
      { key: "pan", label: "PAN", hint: "10-character PAN" },
    ],
  },
  {
    title: "Payouts",
    description: "Settlements are transferred to this account every Tuesday",
    icon: Landmark,
    fields: [
      { key: "bankName", label: "Bank name" },
      { key: "accountNumber", label: "Account number" },
      { key: "ifsc", label: "IFSC code" },
    ],
  },
];

export default function CompanyProfilePage() {
  const { profile, profileLoading, saveProfile } = useVendorStore();
  const [form, setForm] = useState<CompanyProfile>(profile);
  // Phone is edited as country + 10-digit national, stored canonically.
  const [phoneParts, setPhoneParts] = useState(() => splitPhone(profile.phone));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync the form when the profile arrives from the API (only while untouched).
  useEffect(() => {
    if (!dirty) {
      setForm(profile);
      setPhoneParts(splitPhone(profile.phone));
    }
  }, [profile, dirty]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  function set(key: keyof CompanyProfile, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  /** Updates the phone parts and mirrors the canonical string into the form. */
  function setPhone(iso: string, national: string) {
    setPhoneParts({ iso, national });
    const canonical = national ? `+${countryByIso(iso).dial}${national}` : "";
    set("phone", canonical);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const result = await saveProfile(form);
    setSaving(false);
    setErrors(result.errors);
    if (result.ok) {
      setSaved(true);
      setDirty(false);
    }
  }

  if (profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading profile</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-serif text-xl text-primary-foreground">
            {profile.companyName[0] ?? "V"}
          </span>
          <div>
            <p className="font-serif text-xl leading-tight">
              {profile.companyName || "Your company"}
            </p>
            <p className="text-sm text-muted-foreground">
              {profile.categories.length > 0
                ? profile.categories.join(" · ")
                : "Complete your profile to start selling"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Profile saved
            </span>
          )}
          <Button type="submit" disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          Please fix the {Object.keys(errors).length} highlighted field
          {Object.keys(errors).length > 1 ? "s" : ""} below.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <section.icon className="h-4.5 w-4.5 h-[18px] w-[18px] text-primary" aria-hidden />
              </span>
              <div>
                <CardTitle className="font-serif text-xl">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((f) => {
                const wide = f.textarea || f.key === "addressLine" || f.key === "about";
                return (
                  <div key={f.key} className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
                    <label htmlFor={`cp-${f.key}`} className="text-sm font-medium">
                      {f.label}
                    </label>
                    {f.key === "phone" ? (
                      <PhoneInput
                        id={`cp-${f.key}`}
                        countryIso={phoneParts.iso}
                        national={phoneParts.national}
                        onCountryChange={(iso) => setPhone(iso, phoneParts.national)}
                        onNationalChange={(digits) => setPhone(phoneParts.iso, digits)}
                        error={errors[f.key] ?? null}
                      />
                    ) : f.textarea ? (
                      <Textarea
                        id={`cp-${f.key}`}
                        value={String(form[f.key] ?? "")}
                        onChange={(e) => set(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        aria-invalid={Boolean(errors[f.key])}
                      />
                    ) : (
                      <Input
                        id={`cp-${f.key}`}
                        value={String(form[f.key] ?? "")}
                        onChange={(e) => set(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        aria-invalid={Boolean(errors[f.key])}
                      />
                    )}
                    {f.key !== "phone" &&
                      (errors[f.key] ? (
                        <p role="alert" className="text-xs text-destructive">
                          {errors[f.key]}
                        </p>
                      ) : (
                        f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>
                      ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </form>
  );
}
