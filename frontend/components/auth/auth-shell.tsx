"use client";

    import Link from "next/link";
    import { motion } from "framer-motion";
    import { MapPin, MessagesSquare, Rocket } from "lucide-react";

    const points = [
    {
      icon: Rocket,
      title: "Launch anywhere",
      body: "Vendors list once, sell across every region we cover.",
    },
    {
      icon: MapPin,
      title: "Boots on the ground",
      body: "Field officers join from any pin code and start selling.",
    },
    {
      icon: MessagesSquare,
      title: "Always in the loop",
      body: "Live chat keeps vendors, officers and HQ on the same page.",
    },
    ];

    export function AuthShell({
    children,
    eyebrow,
    headline,
    }: {
    children: React.ReactNode;
    eyebrow: string;
    headline: string;
    }) {
    return (
      <div className="flex min-h-screen">
        {/* Brand panel */}
        <div className="texture-grid relative hidden w-[44%] flex-col justify-between overflow-hidden bg-ink p-10 text-ink-foreground lg:flex">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-serif text-xl text-accent-foreground">
              R
            </span>
            <span className="font-serif text-2xl tracking-tight">Recruweb</span>
          </Link>

          <div className="max-w-md">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-serif text-5xl leading-[1.08] tracking-tight text-balance"
            >
              One network. <em className="text-accent">Every doorstep.</em>
            </motion.p>
            <div className="mt-10 flex flex-col gap-6">
              {points.map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
                  className="flex items-start gap-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-soft text-accent">
                    <p.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{p.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <p className="text-xs text-ink-muted">
            Recruweb Sales Partner Portal — All regions, one portal.
          </p>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-serif text-lg text-primary-foreground">
                R
              </span>
              <span className="font-serif text-xl tracking-tight">Recruweb</span>
            </Link>

            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
              {eyebrow}
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight text-balance">
              {headline}
            </h1>

            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    );
    }
    