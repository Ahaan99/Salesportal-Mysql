"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  AlertCircle,
  IndianRupee,
  Package,
  Target,
  Trophy,
  UserCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/portal/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { apiFetcher } from "@/lib/api/client";
import {
  PROFILE_KEY,
  SUMMARY_KEY,
  leaderboardKey,
  performanceKey,
  type FieldSummary,
  type LeaderboardResponse,
  type PerformanceResponse,
  type ProfileResponse,
} from "@/lib/api/field";
import { MiniBars } from "@/components/portal/mini-bars";
import { cn, formatINR } from "@/lib/utils";

export default function FieldDashboard() {
  const { data: summary, error: summaryError } = useSWR<FieldSummary>(SUMMARY_KEY, apiFetcher);
  const { data: profileData } = useSWR<ProfileResponse>(PROFILE_KEY, apiFetcher);
  const { data: leaderboard } = useSWR<LeaderboardResponse>(
    // Wait for the profile so we rank within the officer's own region.
    profileData ? leaderboardKey(profileData.profile?.region) : null,
    apiFetcher
  );
  const { data: perf } = useSWR<PerformanceResponse>(performanceKey("daily", 7), apiFetcher);

  const profileMissing = profileData !== undefined && profileData.profile === null;

  if (summaryError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
        <p className="text-sm font-medium">Could not load your dashboard.</p>
        <p className="max-w-md text-xs text-muted-foreground">{summaryError.message}</p>
      </div>
    );
  }

  const target = summary?.monthly_target ?? 0;
  const sales = summary?.sales_month ?? 0;
  const targetPct = target > 0 ? Math.min(100, Math.round((sales / target) * 100)) : 0;

  const bars =
    perf?.points.map((p) => ({
      label: p.day
        ? new Date(`${p.day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" })
        : "",
      value: Number(p.revenue) || 0,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {profileMissing && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <UserCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="text-sm font-medium">Complete your officer profile</p>
              <p className="text-xs text-muted-foreground">
                Add your region and bank details so commissions can be settled to you.
              </p>
            </div>
          </div>
          <Link
            href="/field/profile"
            className={cn(buttonVariants({ variant: "accent", size: "sm" }), "shrink-0")}
          >
            Create profile
          </Link>
        </div>
      )}

      {/* Target banner */}
      <section className="relative overflow-hidden rounded-xl bg-ink p-6 text-ink-foreground md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-ink-muted">
              {summary
                ? `${summary.orders_month.toLocaleString("en-IN")} orders this month`
                : "Loading your month…"}
            </p>
            <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
              {summary ? formatINR(sales) : "—"}{" "}
              <span className="text-lg text-ink-muted">
                of {summary ? formatINR(target) : "—"} monthly target
              </span>
            </h2>
          </div>
          <Link href="/field/sell" className={cn(buttonVariants({ variant: "accent", size: "lg" }))}>
            Start selling
          </Link>
        </div>
        <div
          className="mt-6 h-2.5 overflow-hidden rounded-full bg-ink-soft"
          role="progressbar"
          aria-valuenow={targetPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Monthly target progress"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${targetPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {targetPct}% of target
          {summary?.region_rank
            ? ` — rank #${summary.region_rank} of ${summary.region_officers} in ${summary.region ?? "your"} region`
            : ""}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Commission this month"
          value={summary ? formatINR(summary.commission_month) : "—"}
          hint={summary ? `${formatINR(summary.commission_pending)} pending settlement` : undefined}
          icon={IndianRupee}
        />
        <StatCard
          index={1}
          label="Units sold"
          value={summary ? summary.units_month.toLocaleString("en-IN") : "—"}
          hint="This month"
          icon={Target}
        />
        <StatCard
          index={2}
          label="Orders placed"
          value={summary ? summary.orders_month.toLocaleString("en-IN") : "—"}
          hint="This month"
          icon={Package}
        />
        <StatCard
          index={3}
          label="Region rank"
          value={summary?.region_rank ? `#${summary.region_rank}` : "—"}
          hint={
            summary?.region
              ? `of ${summary.region_officers} officers in ${summary.region}`
              : "Set your region in My Profile"
          }
          icon={Trophy}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="font-serif text-xl">Last 7 days</CardTitle>
              <CardDescription>Daily sales value</CardDescription>
            </div>
            <Link href="/field/performance" className="text-xs font-medium text-primary hover:underline">
              Full report
            </Link>
          </CardHeader>
          <CardContent>
            {bars.length > 0 && bars.some((b) => b.value > 0) ? (
              <MiniBars data={bars} />
            ) : (
              <p className="flex h-44 items-center justify-center rounded-lg bg-secondary/60 px-4 text-center text-sm text-muted-foreground">
                {perf ? "No sales in the last 7 days — time to hit the road." : "Loading…"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              {profileData?.profile?.region
                ? `${profileData.profile.region} region leaderboard`
                : "Officer leaderboard"}
            </CardTitle>
            <CardDescription>This month · by sales value</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {leaderboard === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : leaderboard.leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No officers ranked yet this month.</p>
            ) : (
              leaderboard.leaderboard.slice(0, 5).map((o) => (
                <div key={o.officer_id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "w-6 font-serif text-xl",
                      o.rank === 1 ? "text-accent" : "text-muted-foreground/50"
                    )}
                  >
                    {o.rank}
                  </span>
                  <Avatar seed={o.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {o.name}
                      {profileData?.profile?.user_id === o.officer_id && (
                        <span className="ml-2 text-xs text-accent">← you</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{o.city ?? o.region ?? "—"}</p>
                  </div>
                  <span className="text-sm font-medium">{formatINR(Number(o.sales))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
