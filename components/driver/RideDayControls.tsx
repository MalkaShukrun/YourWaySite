"use client";

import { useState, useTransition } from "react";
import { cancelRideForDate } from "@/app/(app)/(driver)/actions";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Toast } from "@/components/ui/Toast";

type RideRef = { routeId: string; date: string };

// "Cancel ride for this date only" (SRS §6.1). Passengers see it as
// cancelled, so it asks first and can't be undone.
export function CancelForDateButton({ routeId, date }: RideRef) {
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState({ message: "", id: 0 });
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelRideForDate(routeId, date);
      setToast((t) => ({ id: t.id + 1, message: result.error ?? "הנסיעה בוטלה לתאריך הזה בלבד" }));
      setConfirming(false);
    });

  return (
    <>
      {confirming ? (
        <ConfirmInline
          question="לבטל את הנסיעה? אי אפשר להחזיר אותה."
          confirmLabel="כן, לבטל"
          pendingLabel="מבטל..."
          pending={pending}
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirming(true)}>ביטול הנסיעה לתאריך זה בלבד</button>
      )}
      <Toast message={toast.message} id={toast.id} />
    </>
  );
}
