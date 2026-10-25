"use client";

import { useState, useTransition } from "react";
import { archiveRoute } from "@/app/(driver)/actions";
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
    <span className="confirm-inline">
      <span>להסיר את המסלול?</span>
      <button
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await archiveRoute(routeId);
            if (result.error) setError(result.error);
          })
        }
      >
        {pending ? "מסיר..." : "כן, להסיר"}
      </button>
      <button className="btn btn-secondary" onClick={() => setConfirming(false)}>ביטול</button>
      <Toast message={error} />
    </span>
  );
}
