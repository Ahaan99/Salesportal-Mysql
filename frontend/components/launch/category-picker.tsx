"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  Baby,
  BookOpen,
  Car,
  Check,
  ChevronRight,
  CookingPot,
  Dumbbell,
  Flame,
  Flower2,
  HeartPulse,
  Loader2,
  Luggage,
  Package,
  Palette,
  PawPrint,
  RotateCcw,
  Search,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  WashingMachine,
  Wheat,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { apiFetcher } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  level: number;
  sort_order: number;
}

export interface CategorySelection {
  department: CategoryNode;
  category: CategoryNode;
  subcategory: CategoryNode;
}

const DEPT_ICONS: Record<string, LucideIcon> = {
  "Grocery & Gourmet": ShoppingBasket,
  "Health & Wellness": HeartPulse,
  "Beauty & Personal Care": Sparkles,
  "Home & Kitchen": Sofa,
  "Kitchen Appliances": CookingPot,
  Electronics: Smartphone,
  "Home Appliances": WashingMachine,
  "Men's Fashion": Shirt,
  "Women's Fashion": ShoppingBag,
  "Kids & Baby": Baby,
  "Sports & Fitness": Dumbbell,
  "Books & Stationery": BookOpen,
  Automotive: Car,
  "Pet Supplies": PawPrint,
  "Garden & Outdoors": Flower2,
  "Industrial & Tools": Wrench,
  "Handloom & Handicrafts": Palette,
  "Spiritual & Pooja": Flame,
  "Farm & Agriculture": Wheat,
  "Luggage & Travel": Luggage,
};

interface Props {
  value: CategorySelection | null;
  onChange: (selection: CategorySelection | null) => void;
}

export function CategoryPicker({ value, onChange }: Props) {
  const { data, error, isLoading, mutate } = useSWR<{ categories: CategoryNode[] }>(
    "/api/catalog/categories",
    apiFetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );

  const [deptId, setDeptId] = useState<number | null>(null);
  const [catId, setCatId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const nodes = data?.categories ?? [];

  const byId = useMemo(() => {
    const m = new Map<number, CategoryNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const departments = useMemo(() => nodes.filter((n) => n.level === 0), [nodes]);
  const categories = useMemo(
    () => nodes.filter((n) => n.level === 1 && n.parent_id === deptId),
    [nodes, deptId]
  );
  const subcategories = useMemo(
    () => nodes.filter((n) => n.level === 2 && n.parent_id === catId),
    [nodes, catId]
  );

  // Search across all leaf nodes with their full breadcrumb path.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { leaf: CategoryNode; cat: CategoryNode; dept: CategoryNode }[] = [];
    for (const leaf of nodes) {
      if (leaf.level !== 2) continue;
      const cat = leaf.parent_id != null ? byId.get(leaf.parent_id) : undefined;
      const dept = cat?.parent_id != null ? byId.get(cat.parent_id) : undefined;
      if (!cat || !dept) continue;
      const haystack = `${leaf.name} ${cat.name} ${dept.name}`.toLowerCase();
      if (haystack.includes(q)) out.push({ leaf, cat, dept });
      if (out.length >= 30) break;
    }
    return out;
  }, [query, nodes, byId]);

  function pickLeaf(leaf: CategoryNode, cat: CategoryNode, dept: CategoryNode) {
    onChange({ department: dept, category: cat, subcategory: leaf });
    setQuery("");
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading the category tree…
      </div>
    );
  }

  // ---- Selected state: breadcrumb card with option to change
  if (value) {
    const Icon = DEPT_ICONS[value.department.name] ?? Package;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/5 px-5 py-4"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{value.subcategory.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {value.department.name} <ChevronRight className="inline h-3 w-3" aria-hidden />{" "}
              {value.category.name}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setDeptId(null);
            setCatId(null);
          }}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
        >
          Change
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search across all 400+ subcategories */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all categories — try “ghee”, “smart watch”, “bedsheets”…"
          aria-label="Search categories"
          className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear category search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {query.trim().length >= 2 ? (
        results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No category matches “{query.trim()}”. Try a broader word — e.g. “oil”
            instead of “sunflower oil”.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5">
            {results.map(({ leaf, cat, dept }) => (
              <li key={leaf.id}>
                <button
                  type="button"
                  onClick={() => pickLeaf(leaf, cat, dept)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-secondary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{leaf.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {dept.name} › {cat.name}
                    </span>
                  </span>
                  <Check className="h-4 w-4 shrink-0 text-transparent" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {/* Level 1: department grid */}
          {deptId === null && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {departments.map((d) => {
                const Icon = DEPT_ICONS[d.name] ?? Package;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDeptId(d.id)}
                    className="group flex flex-col items-start gap-2.5 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="text-sm font-medium leading-snug text-pretty">{d.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Level 2 + 3: two-pane drill down */}
          {deptId !== null && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeptId(null);
                  setCatId(null);
                }}
                className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                All departments
              </button>
              <div className="grid gap-3 md:grid-cols-2">
                <ul
                  className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5"
                  aria-label="Categories"
                >
                  {categories.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCatId(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left text-sm transition-colors",
                          catId === c.id
                            ? "bg-primary/10 font-medium text-primary"
                            : "hover:bg-secondary"
                        )}
                      >
                        {c.name}
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <ul
                  className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5"
                  aria-label="Subcategories"
                >
                  {catId === null ? (
                    <li className="flex h-full min-h-32 items-center justify-center p-4 text-center text-xs text-muted-foreground">
                      Pick a category on the left to see its subcategories.
                    </li>
                  ) : (
                    subcategories.map((s) => {
                      const cat = byId.get(catId);
                      const dept = byId.get(deptId);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => cat && dept && pickLeaf(s, cat, dept)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-primary/10 hover:text-primary"
                          >
                            {s.name}
                            <Check className="h-4 w-4 shrink-0 opacity-0" aria-hidden />
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
