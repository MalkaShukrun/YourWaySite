"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { setBookingPaid } from "@/app/(app)/(passenger)/actions";

// Personal "Paid / Unpaid" toggle — only the passenger sees it (SRS §4.3).
export function PaidToggle({ bookingId, isPaid, price }: { bookingId: string; isPaid: boolean; price: string }) {
  const [, startTransition] = useTransition();
  const [paid, setPaid] = useOptimistic(isPaid);

  const toggle = () =>
    startTransition(async () => {
      setPaid(!paid);
      await setBookingPaid(bookingId, !paid);
    });

  return (
    <button
      className={`paid-pill toggleable ${paid ? "" : "unpaid"}`}
      onClick={toggle}
      aria-pressed={paid}
      title="לחצי כדי לשנות את סטטוס התשלום"
    >
      {paid && <Check className="icon" size={15} strokeWidth={1.8} />} {price} · {paid ? "שולם" : "לא שולם"}
    </button>
  );
}
