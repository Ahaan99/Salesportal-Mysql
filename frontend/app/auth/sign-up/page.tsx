"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Store } from "lucide-react";
import { signUpUser, type SellerCategory } from "@/lib/api/auth";
import { type PortalRole } from "@/lib/auth/roles";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const roleOptions: {
  value: PortalRole;
  label: string;
  body: string;
  icon: typeof Store;
}[] = [
  {
    value: "client",
    label: "Vendor / Client",
    body: "Launch and manage your products",
    icon: Store,
  },
  {
    value: "field",
    label: "Sales Person",
    body: "Sell products and earn commission",
    icon: MapPin,
  },
];

// Two ways to sell — shown only when joining as a Sales Person.
const categoryOptions: {
  value: SellerCategory;
  label: string;
  body: string;
}[] = [
  {
    value: "field",
    label: "Field Sales Person",
    body: "Work an assigned territory with beat plans and monthly targets",
  },
  {
    value: "independent",
    label: "Independent Seller",
    body: "Anyone can join — sell from anywhere, no territory required",
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<PortalRole>("client");
  const [sellerCategory, setSellerCategory] = useState<SellerCategory>("field");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    // 1. Create the account via the Recruweb backend (no confirmation
    //    email is sent, so Supabase's email rate limit never applies).
    const result = await signUpUser({
      fullName,
      email: email.trim(),
      password,
      role,
      ...(role === "field" ? { sellerCategory } : {}),
    });

    if (!result.ok) {
      setError(result.error ?? "Could not create your account.");
      setLoading(false);
      return;
    }

    // 2. A 6-digit verification code has been emailed - the account stays
    //    locked until the user enters it on the verify screen.
    router.push(`/auth/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
  }

  return (
    <AuthShell eyebrow="Join the network" headline="Create your account">
      <form onSubmit={handleSignUp} className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">I am joining as</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {roleOptions.map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-ring/30"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <opt.icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold leading-tight">
                    {opt.label}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {opt.body}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {role === "field" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">How do you want to sell?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {categoryOptions.map((option) => {
                const active = sellerCategory === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSellerCategory(option.value)}
                    aria-pressed={active}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/40"
                    }`}
                  >
                    <span className="text-sm font-semibold">{option.label}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {option.body}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-sm font-medium">
            Full name
          </label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Aarav Malhotra"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-sm font-medium">
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="h-11 w-full">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {"Already have an account? "}
          <Link
            href="/auth/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
