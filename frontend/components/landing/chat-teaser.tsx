"use client";

    import { motion } from "framer-motion";
    import { CheckCheck, MessageCircle } from "lucide-react";

    const bubbles = [
    { role: "user", text: "My ghee listing is stuck in review — 3 days now.", time: "10:35" },
    { role: "support", text: "Checking with the catalogue team right now.", time: "10:37" },
    { role: "support", text: "Certificate image was blurry. Review completes within 24h.", time: "10:40" },
    { role: "user", text: "Perfect, thank you!", time: "10:42" },
    ] as const;

    export function ChatTeaser() {
    return (
      <section className="border-b border-border bg-ink text-ink-foreground">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 self-start rounded-full border border-ink-muted/30 px-4 py-1.5 text-xs font-medium text-ink-muted">
              <MessageCircle className="h-3.5 w-3.5 text-accent" aria-hidden />
              Live support chat
            </div>
            <h2 className="font-serif text-4xl tracking-tight text-balance md:text-5xl">
              Talk to us like it&apos;s <em className="text-accent">WhatsApp</em>
            </h2>
            <p className="max-w-md leading-relaxed text-ink-muted text-pretty">
              Vendors and field officers chat directly with our operations desk —
              listing problems, credit approvals, route questions. Real humans,
              read receipts, median reply in 22 minutes.
            </p>
            <ul className="flex flex-col gap-3 text-sm">
              {[
                "One thread per person — full history preserved",
                "Admins see every conversation in the command center",
                "Quick replies for the questions asked every day",
              ].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <CheckCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-ink-muted/25 bg-ink-soft p-5 shadow-2xl"
            aria-label="Preview of the support chat"
          >
            <div className="mb-4 flex items-center gap-3 border-b border-ink-muted/20 pb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                R
              </span>
              <div>
                <p className="text-sm font-medium">Recruweb Support</p>
                <p className="text-xs text-accent">online</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {bubbles.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.25, duration: 0.4 }}
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    b.role === "user"
                      ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                      : "self-start rounded-bl-sm bg-ink text-ink-foreground"
                  }`}
                >
                  <p>{b.text}</p>
                  <p
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      b.role === "user" ? "text-primary-foreground/60" : "text-ink-muted"
                    }`}
                  >
                    {b.time}
                    {b.role === "user" && <CheckCheck className="h-3 w-3" aria-hidden />}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    );
    }
    