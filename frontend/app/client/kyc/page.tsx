"use client";

import { fetchMyKyc, uploadClientDocument, deleteClientDocument, submitClientKyc, CLIENT_KYC_KEY } from "@/lib/api/kyc";
import { KycUploadPage } from "@/components/kyc/kyc-upload";

export default function ClientKycPage() {
  return (
    <KycUploadPage
      swrKey={CLIENT_KYC_KEY}
      fetcher={fetchMyKyc}
      uploadFn={uploadClientDocument}
      deleteFn={deleteClientDocument}
      submitFn={submitClientKyc}
    />
  );
}
