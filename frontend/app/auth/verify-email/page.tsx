"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { resendOtpAction, verifyOtpAction } from "@/app/auth/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

function VerifyEmailForm() {
  const params = useSearchParams();
  const email = (params.get("email") ?? "").trim().toLowerCase();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const submittedRef = useRef(false);

  // Tick the resend cooldown down once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(code: string) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setVerifying(true);
    setError(null);
    setNotice(null);
    const result = await verifyOtpAction(email, code);
    // On success the action redirects and never returns.
    if (result?.error) {
      setError(result.error);
      setVerifying(false);
      submittedRef.current = false;
      setDigits(Array(CODE_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    }
  }

  function handleChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setDigits((d) => {
        const next = [...d];
        next[index] = "";
        return next;
      });
      return;
    }

    // Support typing and pasting multiple digits at once.
    setDigits((d) => {
      const next = [...d];
      const chars = value.slice(0, CODE_LENGTH - index).split("");
      chars.forEach((ch, i) => {
        next[index + i] = ch;
      });
      const focusTo = Math.min(index + chars.length, CODE_LENGTH - 1);
      inputsRef.current[focusTo]?.focus();
      const code = next.join("");
      if (code.length === CODE_LENGTH && /^\d{6}$/.test(code)) {
        void submit(code);
      }
      return next;
    });
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    const result = await resendOtpAction(email);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("A new code is on its way to your inbox.");
    setCooldown(RESEND_COOLDOWN_S);
    setDigits(Array(CODE_LENGTH).fill(""));
    inputsRef.current[0]?.focus();
  }

  if (!email) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This link is missing an email address. Please sign up or sign in again.
        </p>
        <Link href="/auth/sign-up" className={buttonVariants()}>
          Back to sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm leading-relaxed text-muted-foreground">
          We emailed a 6-digit code to{" "}
          <span className="font-medium text-foreground">{email}</span>. Enter it
          below to activate your account. The code expires in 10 minutes.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = digits.join("");
          if (/^\d{6}$/.test(code)) void submit(code);
          else setError("Enter the 6-digit code from your email.");
        }}
        className="flex flex-col gap-5"
      >
        <fieldset disabled={verifying}>
          <legend className="sr-only">6-digit verification code</legend>
          <div className="flex justify-between gap-2">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={CODE_LENGTH}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                className={cn(
                  "h-14 w-12 rounded-xl border border-border bg-background text-center font-mono text-2xl font-semibold text-foreground",
                  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30",
                  "disabled:opacity-60"
                )}
              />
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && !error && (
          <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">
            {notice}
          </p>
        )}

        <Button type="submit" disabled={verifying} className="w-full">
          {verifying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Verifying…
            </>
          ) : (
            "Verify and continue"
          )}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || verifying}
          className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
        <Link href="/auth/login" className="text-muted-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell eyebrow="One last step" headline="Verify your email">
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
