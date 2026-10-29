"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "@/app/(app)/(passenger)/actions";
import { Toast } from "@/components/ui/Toast";

// One-click cancellation (SRS §6.2), until the ride leaves. The seat frees up
// right away, and the ride isn't charged.
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const cancel = () =>
    startTransition(async () => {
      // On success the action moves to /my-rides?cancelled=1, which shows the notice.
      const result = await cancelBooking(bookingId);
      if (result?.error) setMessage(result.error);
    });

  return (
    <>
      <button className="btn btn-ghost" onClick={cancel} disabled={pending}>
        {pending ? "מבטל…" : "ביטול"}
      </button>
      <Toast message={message} />
    </>
  );
}
