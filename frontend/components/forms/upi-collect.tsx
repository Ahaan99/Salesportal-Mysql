"use client";

import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { Smartphone, Copy, Check } from "lucide-react";

const UPI_VPA = process.env.NEXT_PUBLIC_UPI_VPA ?? "";
const UPI_PAYEE = process.env.NEXT_PUBLIC_UPI_PAYEE_NAME ?? "Recruweb Salesportal";

interface UpiCollectProps {
  /** Exact amount the customer must pay, in rupees. */
  amount: number;
  /** Short note shown in the customer's UPI app (e.g. order/product). */
  note: string;
}

/**
 * Real-world UPI collection: renders a scannable UPI QR code and a
 * tap-to-pay deep link carrying the payee VPA, exact amount, and note.
 * The customer scans with any UPI app (GPay, PhonePe, Paytm, BHIM) and
 * their app shows the payment request for this exact amount.
 */
export function UpiCollect({ amount, note }: UpiCollectProps) {
  const [copied, setCopied] = useState(false);

  const upiUrl = useMemo(() => {
    const params = new URLSearchParams({
      pa: UPI_VPA,
      pn: UPI_PAYEE,
      am: amount.toFixed(2),
      cu: "INR",
      tn: note.slice(0, 50),
    });
    return `upi://pay?${params.toString()}`;
  }, [amount, note]);

  if (!UPI_VPA) {
    return (
      <p className="rounded-lg border border-dashed border-input bg-muted/40 p-3 text-xs text-muted-foreground">
        UPI QR unavailable: company UPI ID is not configured
        (NEXT_PUBLIC_UPI_VPA). Collect payment manually and enter the
        transaction reference below.
      </p>
    );
  }

  async function copyVpa() {
    try {
      await navigator.clipboard.writeText(UPI_VPA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/http) - ignore.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-input bg-muted/30 p-4">
      <p className="text-sm font-medium">
        Ask the customer to scan &amp; pay{" "}
        <span className="font-semibold">
          {new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
          }).format(amount)}
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-lg bg-white p-2.5" aria-hidden="true">
          <QRCode value={upiUrl} size={132} />
        </div>

        <div className="flex min-w-[160px] flex-1 flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Works with GPay, PhonePe, Paytm, BHIM and any UPI app. The exact
            amount and order note are pre-filled.
          </p>

          <a
            href={upiUrl}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            Pay via UPI app
          </a>

          <button
            type="button"
            onClick={copyVpa}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors hover:bg-muted"
          >
            {copied ? (
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : `Copy UPI ID`}
          </button>

          <p className="break-all text-xs text-muted-foreground">{UPI_VPA}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        After the customer pays, enter the UPI transaction ID from their
        payment confirmation below.
      </p>
    </div>
  );
}
