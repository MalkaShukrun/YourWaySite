"use client";

import { useState, useTransition } from "react";
import { Clock, Phone } from "lucide-react";
import { cancelBooking } from "@/app/(app)/(passenger)/actions";
import { Toast } from "@/components/ui/Toast";

type Props = { bookingId: string; driverName: string; driverPhone: string | null };

// One-click cancellation (SRS §6.2). A late cancellation is allowed, but the
// passenger is told to call the driver and the ride stays in the payment journal.
export function CancelBookingButton({ bookingId, driverName, driverPhone }: Props) {
  const [pending, startTransition] = useTransition();
  const [late, setLate] = useState(false);
  const [message, setMessage] = useState("");

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelBooking(bookingId);
      if (result.error) setMessage(result.error);
      else if (result.late) setLate(true);
      else setMessage("ההרשמה בוטלה והמקום התפנה");
    });

  return (
    <>
      <button className="btn btn-ghost" onClick={cancel} disabled={pending}>
        {pending ? "מבטלת…" : "ביטול"}
      </button>
      <Toast message={message} />
      {late && (
        <div className="modal-backdrop" onClick={() => setLate(false)}>
          <div className="modal-card small-modal" role="alertdialog" aria-labelledby="late-title" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setLate(false)} aria-label="סגירה">×</button>
            <span className="modal-icon"><Clock className="icon" size={20} strokeWidth={1.8} /></span>
            <h2 id="late-title">הביטול נקלט — ביטול מאוחר</h2>
            <p>
              הביטול בוצע פחות משעתיים לפני היציאה. מומלץ לעדכן את {driverName} בטלפון.
              הנסיעה נשארת ביומן התשלומים שלך.
            </p>
            {driverPhone && (
              <a className="btn btn-primary full-button late-call" href={`tel:${driverPhone}`}>
                <Phone className="icon" size={18} strokeWidth={1.8} /> חיוג אל {driverName}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
