"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck,
  Banknote,
  Check,
  Globe2,
  GraduationCap,
  LocateFixed,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEFAULT_COUNTRY_ISO, validatePhoneIntl } from "@/lib/validation/phone";
import { PhoneInput } from "@/components/forms/phone-input";
import { api, ApiError } from "@/lib/api/client";

const perks = [
  {
    icon: Globe2,
    title: "Join from anywhere",
    desc: "No office, no territory locks. Pick your own city and start the same day.",
  },
  {
    icon: Banknote,
    title: "8% average commission",
    desc: "Weekly settlements straight to your bank. Top officers earn 22k+ monthly.",
  },
  {
    icon: GraduationCap,
    title: "3-day paid training",
    desc: "Product knowledge, route planning, and the selling app — all covered.",
  },
  {
    icon: BadgeCheck,
    title: "Verified officer badge",
    desc: "A company ID retailers trust, plus insurance from day one.",
  },
];

const steps = ["Your details", "Your location", "Done"];

// Two ways to sell on Recruweb.
const sellerCategories = [
  {
    value: "field" as const,
    label: "Field Sales Person",
    desc: "Assigned territory, beat plans, monthly targets",
  },
  {
    value: "independent" as const,
    label: "Independent Seller",
    desc: "Anyone can join — sell from anywhere",
  },
];

export default function JoinPage() {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<"field" | "independent">("field");
  const [name, setName] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY_ISO);
  const [phoneNational, setPhoneNational] = useState("");
  const [phone, setPhone] = useState(""); // canonical "+<dial><national>" after validation
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [applicationCode, setApplicationCode] = useState<string | null>(null);

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api<{ code: string; duplicate: boolean }>(
        "/api/public/join-applications",
        { method: "POST", body: { category, name, phone, city } }
      );
      setApplicationCode(res.code);
      setStep(2);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Could not submit your application. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function detectLocation() {
    setLocationError(null);

    if (!("geolocation" in navigator)) {
      setLocationError("Location is not supported by this browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // Free reverse-geocoding endpoint, no API key required.
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          if (!res.ok) throw new Error(`reverse geocode failed: ${res.status}`);
          const geo = await res.json();
          const locality =
            geo.city || geo.locality || geo.principalSubdivision || "";
          const region =
            geo.principalSubdivision && geo.principalSubdivision !== locality
              ? geo.principalSubdivision
              : geo.countryName;
          const label = [locality, region].filter(Boolean).join(", ");
          if (label) {
            setCity(label);
          } else {
            // Still give the seller something usable.
            setCity(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch {
          // Geocoder unreachable - fall back to raw coordinates.
          setCity(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          setLocationError("Got your position, but could not look up the place name.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError("Location permission denied. Allow access or type your city.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationError("Could not determine your position. Type your city instead.");
        } else {
          setLocationError("Location request timed out. Try again or type your city.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      {/* Hero strip */}
      <section className="relative overflow-hidden rounded-xl bg-ink p-6 text-ink-foreground md:p-10">
        <div className="texture-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-3">
          <Badge variant="accent" className="w-fit">
            Now recruiting in 214 cities
          </Badge>
          <h2 className="max-w-xl text-balance font-serif text-3xl tracking-tight md:text-5xl">
            Any city. Any street. <span className="italic text-accent">Your</span> beat.
          </h2>
          <p className="max-w-lg text-pretty text-sm leading-relaxed text-ink-muted md:text-base">
            Sell real products to real shops in your own neighbourhood — with
            Recruweb backing you from day one.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Perks */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {perks.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-4 rounded-xl border border-border bg-card p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                <p.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium">{p.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Application form */}
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-col gap-6 p-6 md:p-8">
            {/* Stepper */}
            <ol className="flex items-center gap-2" aria-label="Application progress">
              {steps.map((s, i) => (
                <li key={s} className="flex flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      i < step
                        ? "bg-primary text-primary-foreground"
                        : i === step
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-muted-foreground"
                    )}
                    aria-current={i === step ? "step" : undefined}
                  >
                    {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden text-xs sm:block",
                      i === step ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s}
                  </span>
                  {i < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
                </li>
              ))}
            </ol>

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.form
                  key="s0"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const result = validatePhoneIntl(phoneCountry, phoneNational);
                    if (!result.ok || !result.normalized) {
                      setPhoneError(result.error ?? "Enter a valid phone number.");
                      return;
                    }
                    setPhoneError(null);
                    setPhone(result.normalized);
                    setStep(1);
                  }}
                >
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium">How do you want to sell?</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {sellerCategories.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setCategory(c.value)}
                          aria-pressed={category === c.value}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors",
                            category === c.value
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card hover:border-muted-foreground/40"
                          )}
                        >
                          <span className="text-sm font-semibold">{c.label}</span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {c.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="join-name" className="text-sm font-medium">
                      Full name
                    </label>
                    <Input
                      id="join-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="As on your Aadhaar"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="join-phone" className="text-sm font-medium">
                      Mobile number
                    </label>
                    <PhoneInput
                      id="join-phone"
                      countryIso={phoneCountry}
                      national={phoneNational}
                      onCountryChange={(iso) => {
                        setPhoneCountry(iso);
                        setPhoneError(null);
                      }}
                      onNationalChange={(digits) => {
                        setPhoneNational(digits);
                        setPhoneError(null);
                      }}
                      error={phoneError}
                      hint="Select your country code, then enter the 10-digit number."
                      required
                    />
                  </div>
                  <Button type="submit" size="lg" className="mt-2">
                    Continue
                  </Button>
                </motion.form>
              )}

              {step === 1 && (
                <motion.form
                  key="s1"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-4"
                  onSubmit={submitApplication}
                >
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="join-city" className="text-sm font-medium">
                      {category === "independent" ? "Where are you based?" : "Where will you sell?"}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="join-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City or area"
                        required
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={detectLocation}
                        disabled={locating}
                        aria-label="Detect my location"
                      >
                        <LocateFixed
                          className={cn("h-4 w-4", locating && "animate-pulse")}
                          aria-hidden
                        />
                        <span className="hidden sm:inline">
                          {locating ? "Locating…" : "Detect"}
                        </span>
                      </Button>
                    </div>
                    {locationError && (
                      <p className="text-xs text-destructive" role="alert">
                        {locationError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {category === "independent"
                        ? "No territory needed — sell to anyone, anywhere."
                        : "Any location works — we build your route around it."}
                    </p>
                  </div>
                  {submitError && (
                    <p className="text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setStep(0)} disabled={submitting}>
                      Back
                    </Button>
                    <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
                      {submitting ? "Submitting…" : "Submit application"}
                    </Button>
                  </div>
                </motion.form>
              )}

              {step === 2 && (
                <motion.div
                  key="s2"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-4 py-6 text-center"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Rocket className="h-7 w-7" aria-hidden />
                  </span>
                  <h3 className="font-serif text-2xl tracking-tight">
                    You&apos;re in the queue{name ? `, ${name.split(" ")[0]}` : ""}!
                  </h3>
                  <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
                    {category === "independent"
                      ? `Our team will call ${phone || "you"} within 24 hours to activate your independent seller account. Start selling right after verification.`
                      : `Our onboarding team will call ${phone || "you"} within 24 hours to schedule training${city ? ` in ${city}` : ""}. Keep your ID proof handy.`}
                  </p>
                  {applicationCode && (
                    <Badge variant="accent">Application #{applicationCode}</Badge>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
