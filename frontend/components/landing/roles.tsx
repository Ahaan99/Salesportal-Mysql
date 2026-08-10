"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Package, Route, ShieldCheck } from "lucide-react";

const roles = [
  {
    n: "01",
    title: "Vendor / Client",
    tagline: "Launch like a marketplace",
    body: "List products the way you would on Amazon or Flipkart — catalogue, pricing, inventory, reviews. Our network sells them online and on the ground.",
    points: ["Product launch wizard", "Order & inventory tracking", "Revenue analytics"],
    href: "/client",
    icon: Package,
    dark: false,
  },
  {
    n: "02",
    title: "Field Sales Officer",
    tagline: "Sell from any location",
    body: "Like Zepto and Blinkit's street force — anyone, anywhere, can join. Get mapped leads near you, pitch the catalogue, close orders on the spot.",
    points: ["Join from any city", "Hot leads within walking distance", "Instant commission tracking"],
    href: "/field",
    icon: Route,
    dark: true,
  },
  {
    n: "03",
    title: "Super Admin",
    tagline: "See the whole board",
    body: "Company headquarters. Every vendor, every officer, every order and every chat — one command dashboard with region-level drill downs.",
    points: ["Company-wide KPIs", "Officer leaderboards", "Support chat command center"],
    href: "/admin",
    icon: ShieldCheck,
    dark: false,
  },
];

export function Roles() {
  return (
    <section id="roles" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mb-14 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-md font-serif text-4xl tracking-tight text-balance md:text-5xl">
            Three doors, <em className="text-primary">one</em> engine
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Pick your side of the portal. Everyone plugs into the same catalogue,
            the same orders, the same support desk.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {roles.map((role, i) => (
            <motion.div
              key={role.n}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={role.href}
                className={`group flex h-full flex-col gap-6 rounded-xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  role.dark
                    ? "border-ink bg-ink text-ink-foreground hover:shadow-ink/20"
                    : "border-border bg-card text-card-foreground hover:shadow-primary/5"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`font-serif text-5xl ${
                      role.dark ? "text-accent" : "text-primary/25"
                    }`}
                  >
                    {role.n}
                  </span>
                  <role.icon
                    className={`h-6 w-6 ${role.dark ? "text-ink-muted" : "text-primary"}`}
                    aria-hidden
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <p
                    className={`text-xs font-medium uppercase tracking-widest ${
                      role.dark ? "text-accent" : "text-accent-foreground/60"
                    }`}
                  >
                    {role.tagline}
                  </p>
                  <h3 className="font-serif text-3xl">{role.title}</h3>
                  <p
                    className={`text-sm leading-relaxed ${
                      role.dark ? "text-ink-muted" : "text-muted-foreground"
                    }`}
                  >
                    {role.body}
                  </p>
                </div>

                <ul className="mt-auto flex flex-col gap-2">
                  {role.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-1 w-4 rounded-full ${
                          role.dark ? "bg-accent" : "bg-primary"
                        }`}
                        aria-hidden
                      />
                      {p}
                    </li>
                  ))}
                </ul>

                <span
                  className={`inline-flex items-center gap-2 text-sm font-medium ${
                    role.dark ? "text-accent" : "text-primary"
                  }`}
                >
                  Enter portal
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
