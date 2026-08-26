import { Suspense } from "react";
import { LoadingState } from "@/components/states/StatePanel";
import { ResetPasswordView } from "./ResetPasswordView";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <ResetPasswordView />
    </Suspense>
  );
}
