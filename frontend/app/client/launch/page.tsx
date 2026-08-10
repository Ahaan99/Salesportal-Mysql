"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ImageIcon,
  Loader2,
  PartyPopper,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CategoryPicker, type CategorySelection } from "@/components/launch/category-picker";
import { api, ApiError } from "@/lib/api/client";
import { cn, formatINR } from "@/lib/utils";

const steps = ["Category", "Basics", "Pricing & Stock", "Media", "Review"];

const MAX_IMAGES = 7;

interface FormState {
  name: string;
  brand: string;
  description: string;
  price: string;
  mrp: string;
  stock: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  brand: "",
  description: "",
  price: "",
  mrp: "",
  stock: "",
};

export default function LaunchProductPage() {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<CategorySelection | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [images, setImages] = useState<string[]>([]);
  const [imageDraft, setImageDraft] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [launched, setLaunched] = useState<{ name: string; sku: string } | null>(null);

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      // A stale "couldn't continue" message should disappear as soon as
      // the user starts correcting the form.
      setStepError(null);
      setFieldErrors((fe) => {
        if (!(k in fe)) return fe;
        const { [k]: _gone, ...rest } = fe;
        return rest;
      });
    };

  // ---- Per-step client-side validation (server re-validates everything)
  function validateStep(s: number): string | null {
    if (s === 0 && !category) return "Pick a subcategory to continue.";
    if (s === 1) {
      if (form.name.trim().length < 3) return "Product name must be at least 3 characters.";
      if (form.name.trim().length > 180) return "Product name is too long (max 180).";
    }
    if (s === 2) {
      const price = Number(form.price);
      if (!Number.isFinite(price) || price <= 0) return "Enter a valid selling price.";
      if (form.mrp !== "") {
        const mrp = Number(form.mrp);
        if (!Number.isFinite(mrp) || mrp < price)
          return "MRP must be greater than or equal to the selling price.";
      }
      const stock = Number(form.stock);
      if (!Number.isInteger(stock) || stock < 0) return "Enter a valid stock quantity.";
    }
    return null;
  }

  const [stepError, setStepError] = useState<string | null>(null);

  function next() {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  function addImage() {
    const url = imageDraft.trim();
    if (!url) return;
    if (images.length >= MAX_IMAGES) {
      setImageError(`Maximum ${MAX_IMAGES} images.`);
      return;
    }
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      setImageError("Enter a valid https:// image link.");
      return;
    }
    if (images.includes(url)) {
      setImageError("That image is already added.");
      return;
    }
    setImages((imgs) => [...imgs, url]);
    setImageDraft("");
    setImageError(null);
  }

  async function submit() {
    if (!category || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const { product } = await api<{ product: { name: string; sku: string } }>(
        "/api/catalog/products",
        {
          method: "POST",
          body: {
            name: form.name.trim(),
            brand: form.brand.trim(),
            description: form.description.trim(),
            price: Number(form.price),
            mrp: form.mrp === "" ? null : Number(form.mrp),
            stock: Number(form.stock),
            categoryId: category.subcategory.id,
            images,
          },
        }
      );
      setLaunched({ name: product.name, sku: product.sku });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        if (err.fields) {
          setFieldErrors(err.fields);
          // Jump back to the step containing the first invalid field.
          const first = Object.keys(err.fields)[0];
          if (first === "categoryId") setStep(0);
          else if (first === "name" || first === "description") setStep(1);
          else if (first === "price" || first === "mrp" || first === "stock") setStep(2);
          else if (first === "images") setStep(3);
        }
      } else {
        setSubmitError("Something unexpected went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setLaunched(null);
    setStep(0);
    setCategory(null);
    setForm(EMPTY_FORM);
    setImages([]);
    setImageDraft("");
    setSubmitError(null);
    setFieldErrors({});
    setStepError(null);
  }

  // ---- Success screen
  if (launched) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex max-w-lg flex-col items-center gap-5 rounded-xl border border-border bg-card p-10 text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PartyPopper className="h-8 w-8" aria-hidden />
        </span>
        <h2 className="font-serif text-3xl text-balance">{launched.name} is submitted for review</h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          SKU <span className="font-mono font-medium text-foreground">{launched.sku}</span> was
          created in your catalogue. Our team reviews new listings within 24 hours — you&apos;ll
          get a message in support chat the moment it goes live to online buyers and all field
          officers.
        </p>
        <Button onClick={reset} variant="outline">
          Launch another product
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Launch progress">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground"
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:block",
                i === step ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {s}
            </span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-card p-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-5"
          >
            {step === 0 && (
              <>
                <div>
                  <h2 className="font-serif text-2xl">Where does this product belong?</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    20 departments, 500+ subcategories — same depth as any large marketplace.
                    Search directly or browse the tree.
                  </p>
                </div>
                <CategoryPicker value={category} onChange={setCategory} />
                {fieldErrors.categoryId && (
                  <p className="text-xs text-destructive">{fieldErrors.categoryId}</p>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="font-serif text-2xl">Tell us about the product</h2>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Product name
                  <Input
                    value={form.name}
                    onChange={set("name")}
                    maxLength={180}
                    placeholder="e.g. A2 Gir Cow Ghee 500ml"
                    aria-invalid={Boolean(fieldErrors.name)}
                  />
                  {fieldErrors.name && (
                    <span className="text-xs font-normal text-destructive">{fieldErrors.name}</span>
                  )}
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Brand <span className="font-normal text-muted-foreground">(optional)</span>
                  <Input
                    value={form.brand}
                    onChange={set("brand")}
                    maxLength={80}
                    placeholder="e.g. Recruweb Organics"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Description
                  <Textarea
                    value={form.description}
                    onChange={set("description")}
                    maxLength={5000}
                    placeholder="What makes this product worth pitching door to door?"
                  />
                  {fieldErrors.description && (
                    <span className="text-xs font-normal text-destructive">
                      {fieldErrors.description}
                    </span>
                  )}
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="font-serif text-2xl">Pricing &amp; stock</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Selling price (₹)
                    <Input
                      type="number"
                      min="1"
                      inputMode="decimal"
                      value={form.price}
                      onChange={set("price")}
                      placeholder="649"
                      aria-invalid={Boolean(fieldErrors.price)}
                    />
                    {fieldErrors.price && (
                      <span className="text-xs font-normal text-destructive">
                        {fieldErrors.price}
                      </span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    MRP (₹) <span className="font-normal text-muted-foreground">(optional)</span>
                    <Input
                      type="number"
                      min="1"
                      inputMode="decimal"
                      value={form.mrp}
                      onChange={set("mrp")}
                      placeholder="899"
                      aria-invalid={Boolean(fieldErrors.mrp)}
                    />
                    {fieldErrors.mrp && (
                      <span className="text-xs font-normal text-destructive">{fieldErrors.mrp}</span>
                    )}
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Opening stock (units)
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.stock}
                    onChange={set("stock")}
                    placeholder="1000"
                    aria-invalid={Boolean(fieldErrors.stock)}
                  />
                  {fieldErrors.stock && (
                    <span className="text-xs font-normal text-destructive">{fieldErrors.stock}</span>
                  )}
                </label>
                {form.price && form.mrp && Number(form.mrp) >= Number(form.price) && (
                  <p className="rounded-lg bg-accent/10 px-4 py-3 text-xs leading-relaxed text-accent-foreground/80">
                    Buyers will see{" "}
                    <span className="font-semibold">
                      {Math.round((1 - Number(form.price) / Number(form.mrp)) * 100)}% off
                    </span>{" "}
                    — a visible MRP discount dramatically improves door-to-door conversion.
                    Field officers earn 8% commission on this product by default.
                  </p>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <h2 className="font-serif text-2xl">Product media</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Paste https image links (your CDN, brand site, or image host). Up to{" "}
                    {MAX_IMAGES} images — the first one becomes the cover.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={imageDraft}
                    onChange={(e) => {
                      setImageDraft(e.target.value);
                      setImageError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addImage();
                      }
                    }}
                    placeholder="https://cdn.example.com/product-front.jpg"
                    aria-label="Image URL"
                  />
                  <Button type="button" variant="outline" onClick={addImage}>
                    <Plus aria-hidden />
                    Add
                  </Button>
                </div>
                {(imageError || fieldErrors.images) && (
                  <p className="text-xs text-destructive">{imageError ?? fieldErrors.images}</p>
                )}
                {images.length === 0 ? (
                  <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground">
                    <ImageIcon className="h-6 w-6" aria-hidden />
                    <span className="text-xs">No images yet — listings with photos convert 4x better</span>
                  </div>
                ) : (
                  <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {images.map((url, i) => (
                      <li key={url} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url || "/placeholder.svg"}
                          alt={`Product image ${i + 1}`}
                          className="aspect-square w-full rounded-lg border border-border object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.opacity = "0.3";
                          }}
                        />
                        {i === 0 && (
                          <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            Cover
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setImages((imgs) => imgs.filter((u) => u !== url))}
                          aria-label={`Remove image ${i + 1}`}
                          className="absolute right-1.5 top-1.5 rounded-md bg-card/90 p-1.5 text-destructive opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Images are optional — you can submit without them and add media later from your
                  catalogue.
                </p>
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="font-serif text-2xl">Review &amp; submit</h2>
                <dl className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
                  {[
                    ["Product", form.name.trim() || "—"],
                    ["Brand", form.brand.trim() || "—"],
                    [
                      "Category",
                      category
                        ? `${category.department.name} › ${category.category.name} › ${category.subcategory.name}`
                        : "—",
                    ],
                    [
                      "Price",
                      form.price
                        ? `${formatINR(Number(form.price))}${form.mrp ? ` (MRP ${formatINR(Number(form.mrp))})` : ""}`
                        : "—",
                    ],
                    ["Opening stock", form.stock ? `${form.stock} units` : "—"],
                    ["Images", images.length ? `${images.length} attached` : "None"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-4 py-3">
                      <dt className="shrink-0 text-muted-foreground">{k}</dt>
                      <dd className="text-right font-medium text-pretty">{v}</dd>
                    </div>
                  ))}
                </dl>
                {submitError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {submitError}
                  </p>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  By submitting you agree to Recruweb&apos;s catalogue standards. Review typically
                  completes within 24 hours.
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {stepError && (
          <p role="alert" className="mt-4 text-xs text-destructive">
            {stepError}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setStepError(null);
              setStep((s) => Math.max(0, s - 1));
            }}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft aria-hidden />
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={next}>
              Continue
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button variant="accent" onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Submitting…
                </>
              ) : (
                <>
                  Submit for review
                  <Check aria-hidden />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
