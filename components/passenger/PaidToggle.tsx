"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { setBookingPaid } from "@/app/(app)/(passenger)/actions";
import { iconProps } from "@/components/ui/icon";

// Personal "Paid / Unpaid" toggle — only the passenger sees it (SRS §4.3).
export function PaidToggle({ bookingId, isPaid, priceLabel }: { bookingId: string; isPaid: boolean; priceLabel: string }) {
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
      {paid && <Check {...iconProps} size={15} />} {priceLabel} · {paid ? "שולם" : "לא שולם"}
    </button>
  );
}
