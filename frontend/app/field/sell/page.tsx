"use client";

import { Suspense, useState } from "react";
import { UpiCollect } from "@/components/forms/upi-collect";
import { useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_COUNTRY_ISO, validatePhoneIntl } from "@/lib/validation/phone";
import { PhoneInput } from "@/components/forms/phone-input";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  productsKey,
  type FieldProduct,
  type ProductsResponse,
} from "@/lib/api/field";
import {
  submitSale,
  mySalesKey,
  PAYMENT_MODE_LABELS,
  type SubmitSaleInput,
  type SubmitSaleResult,
  type PaymentMode,
} from "@/lib/api/sales";
import { formatINR } from "@/lib/utils";

const COMMISSION_RATE = 0.08;

type FormState = {
  qty: string;
  unit_price: string;
  customer_name: string;
  customer_company: string;
  customer_phone: string; // national digits only
  customer_phone_country: string;
  city: string;
  state: string;
  invoice_ref: string;
  payment_mode: PaymentMode | "";
  payment_ref: string;
  remarks: string;
};

const EMPTY_FORM: FormState = {
  qty: "1",
  unit_price: "",
  customer_name: "",
  customer_company: "",
  customer_phone: "",
  customer_phone_country: DEFAULT_COUNTRY_ISO,
  city: "",
  state: "",
  invoice_ref: "",
  payment_mode: "",
  payment_ref: "",
  remarks: "",
};

function SellNowContent() {
  const params = useSearchParams();
  const preselect = params.get("product");
  const { mutate } = useSWRConfig();

  /* ---- Catalogue state ---- */
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useSWR<ProductsResponse>(
    productsKey({ q, page }),
    apiFetcher,
    { keepPreviousData: true }
  );

  /* ---- Submission form state ---- */
  const [selected, setSelected] = useState<FieldProduct | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitSaleResult | null>(null);

  function selectProduct(product: FieldProduct) {
    setSelected(product);
    setForm({ ...EMPTY_FORM, unit_price: String(product.price) });
    setFieldErrors({});
    setFormError(null);
    setResult(null);
  }

  function clearSelection() {
    setSelected(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setResult(null);
  }

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      ) => {
        setForm((f) => ({ ...f, [key]: e.target.value }));
        setFieldErrors((fe) => {
          const next = { ...fe };
          delete next[key];
          return next;
        });
        setFormError(null);
      },
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !selected) return;
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    // Customer phone is optional, but when provided it must be a valid
    // 10-digit number for the selected country code.
    let canonicalPhone: string | undefined;
    if (form.customer_phone.trim()) {
      const check = validatePhoneIntl(form.customer_phone_country, form.customer_phone);
      if (!check.ok || !check.normalized) {
        setFieldErrors({ customer_phone: check.error ?? "Enter a valid 10-digit number." });
        setSubmitting(false);
        return;
      }
      canonicalPhone = check.normalized;
    }

    try {
      const input: SubmitSaleInput = {
        product_id:       selected.id,
        qty:              Number(form.qty),
        unit_price:       Number(form.unit_price),
        customer_name:    form.customer_name.trim(),
        customer_company: form.customer_company.trim() || undefined,
        customer_phone:   canonicalPhone,
        city:             form.city.trim() || undefined,
        state:            form.state.trim() || undefined,
        invoice_ref:      form.invoice_ref.trim() || undefined,
        payment_mode:     form.payment_mode || undefined,
        payment_ref:      form.payment_ref.trim() || undefined,
        remarks:          form.remarks.trim() || undefined,
      };

      const res = await submitSale(input);
      setResult(res);
      setForm(EMPTY_FORM);
      // Refresh the officer's sales list
      mutate(mySalesKey());
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(search.trim());
    setPage(1);
  }

  const qty = Number(form.qty);
  const price = Number(form.unit_price);
  const total = Number.isFinite(qty * price) ? qty * price : 0;
  const commission = Math.round(total * COMMISSION_RATE * 100) / 100;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* ---- LEFT: Product catalogue ---- */}
      <div className="flex flex-col gap-4 min-w-0 flex-1">
        <form onSubmit={submitSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading products…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Could not load products. Make sure the backend is running.
          </div>
        )}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.products.map((p) => (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => selectProduct(p)}
                  className={[
                    "flex gap-3 rounded-xl border p-4 text-left transition-all",
                    "hover:border-accent/60 hover:bg-accent/5",
                    selected?.id === p.id
                      ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                      : "border-border bg-card",
                  ].join(" ")}
                >
                  {p.images?.[0] && (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="h-14 w-14 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug">{p.name}</p>
                    {p.brand && (
                      <p className="text-xs text-muted-foreground">{p.brand}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{formatINR(p.price)}</span>
                      {p.mrp && p.mrp > p.price && (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatINR(p.mrp)}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs py-0">
                        {Math.round(COMMISSION_RATE * 100)}% comm.
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stock: {p.stock > 0 ? p.stock.toLocaleString("en-IN") : "Out of stock"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" />
                </motion.button>
              ))}
            </div>

            {/* Pagination */}
            {data.total > data.pageSize && (
              <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
                <span>
                  {(page - 1) * data.pageSize + 1}–
                  {Math.min(page * data.pageSize, data.total)} of {data.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page * data.pageSize >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {data?.products.length === 0 && !isLoading && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No products found{q ? ` for "${q}"` : ""}.
          </p>
        )}
      </div>

      {/* ---- RIGHT: Submission form ---- */}
      <div className="w-full lg:w-[420px] shrink-0">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center"
            >
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No product selected</p>
              <p className="text-xs text-muted-foreground">
                Pick a product from the catalogue to start your sale submission.
              </p>
            </motion.div>
          ) : result ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-900 dark:bg-green-950/30"
            >
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div>
                <p className="text-base font-semibold">Sale submitted!</p>
                <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => { clearSelection(); }}
              >
                Submit another sale
              </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleSubmit}
              className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Submitting sale for
                  </p>
                  <p className="mt-0.5 font-serif text-lg font-semibold leading-snug">
                    {selected.name}
                  </p>
                  {selected.brand && (
                    <p className="text-xs text-muted-foreground">{selected.brand}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Global error */}
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Section: Sale details */}
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sale details
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Qty sold *</label>
                    <Input
                      type="number"
                      min="1"
                      {...field("qty")}
                      className={fieldErrors.qty ? "border-destructive" : ""}
                    />
                    {fieldErrors.qty && (
                      <p className="mt-1 text-xs text-destructive">{fieldErrors.qty}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Selling price (₹) *</label>
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      {...field("unit_price")}
                      className={fieldErrors.unit_price ? "border-destructive" : ""}
                    />
                    {fieldErrors.unit_price && (
                      <p className="mt-1 text-xs text-destructive">{fieldErrors.unit_price}</p>
                    )}
                  </div>
                </div>
                {total > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Total sale value</span>
                    <div className="text-right">
                      <span className="font-semibold">{formatINR(total)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        → {formatINR(commission)} commission
                      </span>
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Section: Customer details */}
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer details
                </legend>
                <div>
                  <label className="mb-1 block text-xs font-medium">Customer name *</label>
                  <Input
                    placeholder="Full name"
                    {...field("customer_name")}
                    className={fieldErrors.customer_name ? "border-destructive" : ""}
                  />
                  {fieldErrors.customer_name && (
                    <p className="mt-1 text-xs text-destructive">{fieldErrors.customer_name}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Company / Organisation</label>
                  <Input placeholder="Optional" {...field("customer_company")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Mobile number</label>
                    <PhoneInput
                      countryIso={form.customer_phone_country}
                      national={form.customer_phone}
                      onCountryChange={(iso) => {
                        setForm((f) => ({ ...f, customer_phone_country: iso }));
                        setFieldErrors((fe) => {
                          const next = { ...fe };
                          delete next.customer_phone;
                          return next;
                        });
                      }}
                      onNationalChange={(digits) => {
                        setForm((f) => ({ ...f, customer_phone: digits }));
                        setFieldErrors((fe) => {
                          const next = { ...fe };
                          delete next.customer_phone;
                          return next;
                        });
                      }}
                      error={fieldErrors.customer_phone}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">City</label>
                    <Input placeholder="City" {...field("city")} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">State</label>
                  <Input placeholder="State" {...field("state")} />
                </div>
              </fieldset>

              {/* Section: Payment proof */}
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment proof
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Invoice / Bill no.</label>
                    <Input placeholder="e.g. INV-2026-001" {...field("invoice_ref")} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Payment mode</label>
                    <select
                      {...field("payment_mode")}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Select —</option>
                      {(Object.entries(PAYMENT_MODE_LABELS) as [PaymentMode, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {form.payment_mode === "upi" && total > 0 && (
                  <UpiCollect
                    amount={total}
                    note={`${selected?.name ?? "Order"} x${form.qty || 1}`}
                  />
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium">Payment reference</label>
                  <Input placeholder="UPI TxnID / cheque no. / transfer ref" {...field("payment_ref")} />
                </div>
              </fieldset>

              {/* Remarks */}
              <div>
                <label className="mb-1 block text-xs font-medium">Remarks (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Any additional notes for the verification team…"
                  {...field("remarks")}
                  className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit for Verification"
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                The Recruweb team will review your submission and release your commission once verified.
              </p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function SellNowPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Submit a Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a product, enter customer and payment details, and submit for Recruweb verification.
          Your commission will be released once the sale is approved.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SellNowContent />
      </Suspense>
    </div>
  );
}
