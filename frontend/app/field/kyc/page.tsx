"use client";

import { fetchMyKyc, uploadFieldDocument, deleteFieldDocument, submitFieldKyc, FIELD_KYC_KEY } from "@/lib/api/kyc";
import { KycUploadPage } from "@/components/kyc/kyc-upload";

export default function FieldKycPage() {
  return (
    <KycUploadPage
      swrKey={FIELD_KYC_KEY}
      fetcher={fetchMyKyc}
      uploadFn={uploadFieldDocument}
      deleteFn={deleteFieldDocument}
      submitFn={submitFieldKyc}
    />
  );
}
