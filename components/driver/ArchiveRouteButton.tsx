"use client";

import { useState, useTransition } from "react";
import { archiveRoute } from "@/app/(app)/(driver)/actions";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Toast } from "@/components/ui/Toast";

// Asks once — reminding the driver to check for upcoming bookings and tell
// those passengers — then stops offering the route.
export function ArchiveRouteButton({ routeId }: { routeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return <button className="btn btn-ghost" onClick={() => setConfirming(true)}>הסרת המסלול</button>;
  }
  return (
    <>
      <p className="form-alert archive-warning" role="alert">
        לפני ההסרה, ודאי שאין טרמפיסטיות רשומות לאחד התאריכים הקרובים. אם יש — עדכני אותן על השינוי.
      </p>
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
