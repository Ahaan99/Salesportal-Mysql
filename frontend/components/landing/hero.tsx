"use client";

    import Link from "next/link";
    import { motion } from "framer-motion";
    import { ArrowUpRight, MapPin } from "lucide-react";
    import { buttonVariants } from "@/components/ui/button";
    import { cn } from "@/lib/utils";

    const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.1 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
    }),
    };

    export function Hero() {
    return (
      <section className="texture-grid relative overflow-hidden border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-20 pt-24 md:pb-28 md:pt-32">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0}
            className="flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
            139 field officers live across 4 regions right now
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="max-w-4xl font-serif text-5xl leading-[1.05] tracking-tight text-foreground text-balance md:text-7xl"
          >
            Every product deserves a marketplace.{" "}
            <em className="text-primary">Every seller</em> deserves a territory.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty"
          >
            Recruweb Sales Partner Portal is one portal with three fronts — clients launch products
            like a marketplace, field sales officers sell from any street in any city,
            and Recruweb team watches every rupee move in real time.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="flex flex-wrap items-center gap-3"
          >
            <Link href="/client" className={cn(buttonVariants({ size: "lg" }))}>
              Launch your products
              <ArrowUpRight aria-hidden />
            </Link>
            <Link
              href="/field/join"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              <MapPin aria-hidden />
              Join as field officer
            </Link>
          </motion.div>

          <motion.dl
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={4}
            className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4"
          >
            {[
              { k: "\u20b91.7 Cr", v: "GMV this month" },
              { k: "48", v: "Vendor brands live" },
              { k: "139", v: "Field officers on ground" },
              { k: "22 min", v: "Median chat response" },
            ].map((s) => (
              <div key={s.v} className="flex flex-col gap-1 bg-card p-5">
                <dt className="order-2 text-xs text-muted-foreground">{s.v}</dt>
                <dd className="order-1 font-serif text-3xl text-primary">{s.k}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>
    );
    }
    