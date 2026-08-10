import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SignUpSuccessPage() {
  return (
    <AuthShell eyebrow="One last step" headline="Check your inbox">
      <div className="flex flex-col items-start gap-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MailCheck className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We sent a confirmation link to your email address. Click it to
          activate your Recruweb account, then sign in to reach your portal.
        </p>
        <Link href="/auth/login" className={cn(buttonVariants(), "h-11")}>
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
