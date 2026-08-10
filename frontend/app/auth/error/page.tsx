import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AuthErrorPage() {
  return (
    <AuthShell eyebrow="Something went wrong" headline="We couldn't sign you in">
      <div className="flex flex-col items-start gap-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The sign-in link may have expired or already been used. Please try
          signing in again, or create a new account.
        </p>
        <Link href="/auth/login" className={cn(buttonVariants(), "h-11")}>
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
