"use client";

import { useState, useTransition } from "react";
import { Phone, Plus, User } from "lucide-react";
import { addPassenger, removePassenger } from "@/app/(app)/(driver)/actions";
import type { Stop } from "@/lib/ride-types";
import { GUEST_NAME_MAX } from "@/lib/validation/passenger";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Select } from "@/components/ui/Select";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";

type RideRef = { routeId: string; date: string };

// The driver adds a passenger by hand — someone who called, or isn't signed
// up. The booking stays on the driver's list only, apart from user accounts.
export function AddPassengerForm({ routeId, date, stops }: RideRef & { stops: Stop[] }) {
  const pickups = stops.filter((s) => s.kind === "pickup");
  const dropoffs = stops.filter((s) => s.kind === "dropoff");
  const empty = { name: "", phone: "", pickupStopId: pickups[0]?.id ?? "", dropoffStopId: dropoffs[0]?.id ?? "" };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(empty);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", id: 0 });
  const [pending, startTransition] = useTransition();

  const set = (field: keyof typeof empty) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  const submit = () =>
    startTransition(async () => {
      setError("");
      const result = await addPassenger(routeId, date, values);
      if (result.error) return setError(result.error);
      setToast((t) => ({ id: t.id + 1, message: `${values.name.trim()} נוספה לנסיעה` }));
      setValues(empty);
      setOpen(false);
    });

  if (!open) {
    return (
      <>
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          <Plus {...iconProps} size={18} /> הוספת טרמפיסטית
        </button>
        <Toast message={toast.message} id={toast.id} />
      </>
    );
  }

  return (
    <form className="add-passenger" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div>
        <strong>הוספת טרמפיסטית לנסיעה</strong>
        <span>הטרמפיסטית תופיע ברשימה שלך בלבד ותתפוס מקום בנסיעה</span>
      </div>
      <div className="add-passenger-fields">
        <label className="field">
          <span>שם מלא</span>
          <div className="input-shell"><User {...iconProps} size={20} /><input value={values.name} onChange={(e) => set("name")(e.target.value)} maxLength={GUEST_NAME_MAX} autoComplete="off" /></div>
        </label>
        <label className="field">
          <span>טלפון</span>
          <div className="input-shell"><Phone {...iconProps} size={20} /><input value={values.phone} onChange={(e) => set("phone")(e.target.value)} type="tel" inputMode="tel" placeholder="050-000-0000" autoComplete="off" /></div>
        </label>
        <div className="field">
          <span>תחנת איסוף</span>
          <Select label="תחנת איסוף" value={values.pickupStopId} onChange={set("pickupStopId")} options={pickups.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <div className="field">
          <span>תחנת הורדה</span>
          <Select label="תחנת הורדה" value={values.dropoffStopId} onChange={set("dropoffStopId")} options={dropoffs.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
      </div>
      {error && <small className="field-error" role="alert">{error}</small>}
      <div className="add-passenger-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "מוסיף..." : "הוספה לנסיעה"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setError(""); }}>ביטול</button>
      </div>
    </form>
  );
}

// Takes a passenger the driver added off the ride, after asking once.
export function RemovePassengerButton({ bookingId, name }: { bookingId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState({ message: "", id: 0 });
  const [pending, startTransition] = useTransition();

  return (
    <>
      {confirming ? (
        <ConfirmInline
          question={`להסיר את ${name} מהנסיעה?`}
          confirmLabel="כן, להסיר"
          pendingLabel="מסיר..."
          pending={pending}
          onConfirm={() =>
            startTransition(async () => {
              const message = (await removePassenger(bookingId)).error;
              if (message) setError((e) => ({ id: e.id + 1, message }));
              setConfirming(false);
            })
          }
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirming(true)}>הסרה</button>
      )}
      <Toast message={error.message} id={error.id} />
    </>
  );
}
