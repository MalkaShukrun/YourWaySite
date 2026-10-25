"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { setRideCancelled, updateRideTime } from "@/app/(app)/(driver)/actions";
import { Toast } from "@/components/ui/Toast";

type RideRef = { routeId: string; date: string };

// Update today's departure time on the fly (SRS §5.2).
export function TimeUpdateForm({ routeId, date, time, disabled }: RideRef & { time: string; disabled: boolean }) {
  const [value, setValue] = useState(time);
  const [toast, setToast] = useState({ message: "", id: 0 });
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateRideTime(routeId, date, value);
      setToast((t) => ({ id: t.id + 1, message: result.error ?? `שעת היציאה עודכנה ל־${value}` }));
    });

  return (
    <div className="time-update">
      <div>
        <Clock className="icon" size={20} strokeWidth={1.8} />
        <div>
          <strong>שעת יציאה מעודכנת</strong>
          <span>שינוי השעה חל על התאריך הזה בלבד</span>
        </div>
      </div>
      <div className="time-control">
        <input type="time" value={value} onChange={(e) => setValue(e.target.value)} aria-label="שעת יציאה" disabled={disabled} />
        <button className="btn btn-secondary" onClick={save} disabled={disabled || pending || value === time}>
          {pending ? "מעדכן..." : "עדכון שעה"}
        </button>
      </div>
      <Toast message={toast.message} id={toast.id} />
    </div>
  );
}

// "Cancel ride for this date only" and undo (SRS §6.1).
export function CancelForDateButton({ routeId, date, cancelled }: RideRef & { cancelled: boolean }) {
  const [toast, setToast] = useState({ message: "", id: 0 });
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await setRideCancelled(routeId, date, !cancelled);
      const message = result.error ?? (cancelled ? "הנסיעה הוחזרה ללוח" : "הנסיעה בוטלה לתאריך הזה בלבד");
      setToast((t) => ({ id: t.id + 1, message }));
    });

  return (
    <>
      <button className="btn btn-ghost" onClick={toggle} disabled={pending}>
        {cancelled ? "החזרת הנסיעה" : "ביטול הנסיעה לתאריך זה בלבד"}
      </button>
      <Toast message={toast.message} id={toast.id} />
    </>
  );
}
