"use client";

import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  index = 0,
  hint,
}: {
  label: string;
  value: string;
  change?: number;
  icon: LucideIcon;
  index?: number;
  hint?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      {/* Instrument Serif has no rupee glyph - render a leading currency symbol in the sans font */}
      <p className="font-serif text-3xl tracking-tight">
        {value.startsWith("\u20B9") ? (
          <>
            <span className="font-sans text-2xl font-medium">{"\u20B9"}</span>
            {value.slice(1)}
          </>
        ) : (
          value
        )}
      </p>
      {change !== undefined ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            change >= 0 ? "text-primary" : "text-destructive"
          )}
        >
          {change >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" aria-hidden />
          )}
          {change >= 0 ? "+" : ""}
          {change}% vs last month
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </motion.div>
  );
}
