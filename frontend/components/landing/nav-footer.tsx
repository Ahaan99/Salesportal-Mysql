import Link from "next/link";
    import { buttonVariants } from "@/components/ui/button";
    import { cn } from "@/lib/utils";

    export function LandingNav() {
    return (
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <nav
          className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
          aria-label="Main"
        >
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-serif text-lg text-primary-foreground">
              R
            </span>
            <span className="font-serif text-xl tracking-tight">Recruweb</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <Link href="/client" className="transition-colors hover:text-foreground">
              For vendors
            </Link>
            <Link href="/field" className="transition-colors hover:text-foreground">
              For field officers
            </Link>
            <Link href="/admin" className="transition-colors hover:text-foreground">
              Admin
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/auth/login"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Log in
            </Link>
            <Link href="/auth/sign-up" className={cn(buttonVariants({ size: "sm" }))}>
              Join the network
            </Link>
          </div>
        </nav>
      </header>
    );
    }

    export function LandingFooter() {
    return (
      <footer className="bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16">
          <p className="font-serif text-4xl tracking-tight text-balance md:text-6xl">
            Launch it. <em className="text-accent">Walk it.</em> Watch it.
          </p>
          <div className="flex flex-col justify-between gap-6 border-t border-ink-muted/20 pt-8 text-sm text-ink-muted md:flex-row md:items-center">
            <p>Recruweb Sales Partner Portal — All regions, one portal.</p>
            <div className="flex gap-6">
              <Link href="/client" className="transition-colors hover:text-ink-foreground">
                Vendor portal
              </Link>
              <Link href="/field" className="transition-colors hover:text-ink-foreground">
                Field portal
              </Link>
              <Link href="/admin" className="transition-colors hover:text-ink-foreground">
                Super admin
              </Link>
            </div>
          </div>
        </div>
      </footer>
    );
    }
    