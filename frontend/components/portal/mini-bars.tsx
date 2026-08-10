"use client";

import { motion } from "framer-motion";
import type { StatPoint } from "@/lib/types";

export function MiniBars({
  data,
  suffix = "",
}: {
  data: StatPoint[];
  suffix?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      className="flex h-44 gap-2.5"
      role="img"
      aria-label={`Bar chart: ${data.map((d) => `${d.label} ${d.value}${suffix}`).join(", ")}`}
    >
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center gap-2">
          {/* flex-1 wrapper gives the bar a definite height to resolve its % against */}
          <div className="flex w-full flex-1 items-end">
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: `${(d.value / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className={`w-full rounded-t-md ${
                i === data.length - 1 ? "bg-accent" : "bg-primary/80"
              }`}
              style={{ minHeight: 4 }}
            />
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
