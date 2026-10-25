"use client";

import { useState, useTransition } from "react";
import { archiveRoute } from "@/app/(app)/(driver)/actions";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Toast } from "@/components/ui/Toast";

// Asks once, then stops offering the route.
export function ArchiveRouteButton({ routeId }: { routeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return <button className="btn btn-ghost" onClick={() => setConfirming(true)}>הסרת המסלול</button>;
  }
  return (
    <>
      <ConfirmInline
        question="להסיר את המסלול?"
        confirmLabel="כן, להסיר"
        pendingLabel="מסיר..."
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await archiveRoute(routeId);
            if (result.error) setError(result.error);
          })
        }
        onCancel={() => setConfirming(false)}
      />
      <Toast message={error} />
    </>
  );
}
