"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type LoginState } from "./actions";

/**
 * Login form — thin client over the server action in ./actions.ts.
 *
 * Security notes:
 *  - Credentials are POSTed to the server action; the browser never calls
 *    Supabase directly, so session cookies are set HttpOnly server-side.
 *  - `useActionState` + `pending` make the submission idempotent in the UI:
 *    rapid clicks, Enter-spam, and double submits collapse into one
 *    in-flight request.
 *  - The `next` deep-link is passed along but validated ON THE SERVER —
 *    this hidden input is UX only, never trusted.
 */

const initialState: LoginState = { error: null };

function LoginForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "";
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={nextParam} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          maxLength={254}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          disabled={pending}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {"New to Recruweb? "}
        <Link
          href="/auth/sign-up"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell eyebrow="Welcome back" headline="Sign in to your portal">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
