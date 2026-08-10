"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldCheck,
  ShieldX,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ALL_DOC_TYPES,
  DOC_TYPE_LABELS,
  type MyKycResponse,
  type KycStatus,
  type DocType,
  type KycDocument,
} from "@/lib/api/kyc";

export const STATUS_CONFIG: Record<KycStatus, {
  label: string;
  variant: "default" | "secondary" | "success" | "destructive" | "outline";
  icon: typeof ShieldCheck;
  description: string;
}> = {
  draft:    { label: "Draft",          variant: "secondary",    icon: Clock,       description: "Upload your documents and submit for verification." },
  pending:  { label: "Under Review",   variant: "outline",      icon: Clock,       description: "Your documents are being reviewed by our team." },
  approved: { label: "KYC Verified",   variant: "success",      icon: ShieldCheck, description: "Your KYC is approved. You are fully verified." },
  rejected: { label: "Rejected",       variant: "destructive",  icon: ShieldX,     description: "Your submission was rejected. See the reason below and re-upload." },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface KycUploadPageProps {
  swrKey: string;
  fetcher: (url: string) => Promise<MyKycResponse>;
  uploadFn: (docType: DocType, file: File) => Promise<{ document: KycDocument }>;
  deleteFn: (id: string) => Promise<{ ok: boolean }>;
  submitFn: () => Promise<{ submission: MyKycResponse["submission"] }>;
}

export function KycUploadPage({ swrKey, fetcher, uploadFn, deleteFn, submitFn }: KycUploadPageProps) {
  const { data, isLoading, error, mutate } = useSWR<MyKycResponse>(swrKey, fetcher);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitDone, setSubmitDone] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRefs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({});

  const submission = data?.submission;
  const documents  = data?.documents ?? [];
  const status     = submission?.status ?? "draft";
  const cfg        = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  const canEdit    = status === "draft" || status === "rejected";
  const canSubmit  = canEdit && documents.length > 0 && !submitting;

  function getDoc(docType: DocType) {
    return documents.find(d => d.doc_type === docType) ?? null;
  }

  async function handleFileChange(docType: DocType, file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(docType);
    try {
      await uploadFn(docType, file);
      await mutate();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
      // reset file input
      const ref = fileInputRefs.current[docType];
      if (ref) ref.value = "";
    }
  }

  async function handleDelete(docId: string) {
    setDeleting(docId);
    try {
      await deleteFn(docId);
      await mutate();
    } catch {
      // silently fail — SWR will re-validate
    } finally {
      setDeleting(null);
    }
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitFn();
      setSubmitDone(true);
      await mutate();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your KYC status…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center text-sm text-destructive">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 opacity-60" />
        Could not load your KYC data. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-xl bg-ink p-6 text-ink-foreground md:flex-row md:items-center md:justify-between md:p-8"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <StatusIcon className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl tracking-tight">KYC Verification</h2>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{cfg.description}</p>
          </div>
        </div>
        {status === "approved" && (
          <CheckCircle2 className="h-8 w-8 text-green-400 md:shrink-0" />
        )}
      </motion.div>

      {/* Rejection Reason */}
      <AnimatePresence>
        {status === "rejected" && submission?.rejection_reason && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Rejection reason</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{submission.rejection_reason}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload errors */}
      <AnimatePresence>
        {uploadError && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {uploadError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ALL_DOC_TYPES.map((docType, i) => {
          const doc = getDoc(docType);
          const isUploading = uploading === docType;
          const isDeletingThis = doc && deleting === doc.id;

          return (
            <motion.div
              key={docType}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className={doc ? "border-green-500/30 bg-green-50/30 dark:border-green-500/20 dark:bg-green-950/10" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className={`h-4 w-4 shrink-0 ${doc ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                      <CardTitle className="text-sm font-medium">{DOC_TYPE_LABELS[docType]}</CardTitle>
                    </div>
                    {doc ? (
                      <Badge variant="success" className="shrink-0 text-xs">Uploaded</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-xs">Required</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {doc && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <p className="truncate font-medium text-foreground">{doc.file_name}</p>
                      <p className="mt-0.5">{formatBytes(doc.file_size)}</p>
                    </div>
                  )}

                  {canEdit && (
                    <div className="flex gap-2">
                      {/* Hidden file input */}
                      <input
                        ref={el => { fileInputRefs.current[docType] = el; }}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
                        className="sr-only"
                        onChange={e => handleFileChange(docType, e.target.files?.[0])}
                        aria-label={`Upload ${DOC_TYPE_LABELS[docType]}`}
                      />
                      <Button
                        variant={doc ? "outline" : "default"}
                        size="sm"
                        className="flex-1"
                        disabled={!!uploading || !!deleting}
                        onClick={() => fileInputRefs.current[docType]?.click()}
                      >
                        {isUploading ? (
                          <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading…</>
                        ) : doc ? (
                          <><Upload className="mr-1.5 h-3.5 w-3.5" />Replace</>
                        ) : (
                          <><Upload className="mr-1.5 h-3.5 w-3.5" />Upload</>
                        )}
                      </Button>
                      {doc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={!!uploading || !!deleting}
                          onClick={() => handleDelete(doc.id)}
                        >
                          {isDeletingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}

                  {!canEdit && !doc && (
                    <p className="text-xs text-muted-foreground italic">Not provided</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Submit Section */}
      {canEdit && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div>
              <h3 className="font-medium">Ready to submit?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload at least one document, then submit your KYC for admin review. You cannot change documents after submission.
              </p>
            </div>

            <AnimatePresence>
              {submitError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {submitError}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {submitDone && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Submitted successfully! Our team will review your documents shortly.
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" />Submit for Verification</>
              )}
            </Button>
            {documents.length === 0 && (
              <p className="text-xs text-muted-foreground">Upload at least one document to submit.</p>
            )}
          </CardContent>
        </Card>
      )}

      {status === "pending" && (
        <Card className="border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10">
          <CardContent className="flex items-center gap-4 p-5">
            <Clock className="h-8 w-8 shrink-0 text-blue-500" />
            <div>
              <p className="font-medium">Verification in progress</p>
              <p className="text-sm text-muted-foreground">
                Submitted on{" "}
                {submission?.submitted_at
                  ? new Date(submission.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
