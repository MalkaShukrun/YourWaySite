"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cancelRideAlert } from "@/app/(app)/(passenger)/actions";
import { Toast } from "@/components/ui/Toast";

// "ביטול" on one of her alerts (spec C11). When she came from the email's
// "הסרת ההתראה" link, this is the alert it named: its row is highlighted and
// scrolled into view, and she decides whether to cancel it.
export function CancelAlertButton({ alertId, highlighted = false }: { alertId: string; highlighted?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!highlighted) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.closest(".activity-row")?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, [highlighted]);

  const cancel = () =>
    startTransition(async () => {
      // On success the action reloads "ההתראות שלי" with a notice.
      const result = await cancelRideAlert(alertId);
      if (result?.error) setMessage(result.error);
    });

  return (
    <>
      <button ref={ref} className="btn btn-ghost" onClick={cancel} disabled={pending}>
        {pending ? "מבטלת…" : "ביטול"}
      </button>
      <Toast message={message} />
    </>
  );
}
