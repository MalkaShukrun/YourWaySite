"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, BellRing, Check, MapPin } from "lucide-react";
import { createRideAlert } from "@/app/(app)/(passenger)/actions";
import { ModalForm } from "@/components/ui/ModalForm";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { MultiSelect } from "@/components/ui/Select";
import { iconProps } from "@/components/ui/icon";
import { placeOptions } from "@/lib/rides/search";
import type { RideGroup } from "@/lib/rides/types";

// `date` is both the start and the end date, unless `endDate` is given.
type Initial = { origins?: string[]; destinations?: string[]; date?: string; endDate?: string; from?: string; to?: string };

// "עדכנו אותי" (spec C10), in two places, for the same kind of alert:
// - a search with no results: inside the "no results" card, filled from the
//   search — the places, its date, its departure times;
// - a full ride's card (`onCard`): in its footer, filled from the card — its
//   places and dates.
// The button opens a form she can change before saving. Saved, it gives way
// to a note with a link to her alerts.
export function RideAlertButton({ onCard = false, groups, initial, today }: { onCard?: boolean; groups: RideGroup[]; initial: Initial; today: string }) {
  const fromSearch = () => ({
    origins: initial.origins ?? [],
    destinations: initial.destinations ?? [],
    startDate: initial.date ?? "",
    endDate: initial.endDate ?? initial.date ?? "",
    fromTime: initial.from ?? "",
    untilTime: initial.to ?? "",
  });
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState(fromSearch);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const options = placeOptions(groups);
  const set = <K extends keyof typeof fields>(key: K) => (value: (typeof fields)[K]) => setFields((f) => ({ ...f, [key]: value }));

  const openForm = () => {
    setFields(fromSearch());
    setError("");
    setOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!fields.origins.length || !fields.destinations.length) return setError("יש לבחור מאיפה ולאן.");
    if (fields.startDate && fields.endDate && fields.startDate > fields.endDate) {
      return setError("תאריך ההתחלה צריך להיות לפני תאריך הסיום או באותו יום.");
    }
    startTransition(async () => {
      setError("");
      const result = await createRideAlert({
        origins: fields.origins,
        destinations: fields.destinations,
        startDate: fields.startDate || undefined,
        endDate: fields.endDate || undefined,
        fromTime: fields.fromTime || undefined,
        untilTime: fields.untilTime || undefined,
      });
      if (result.error) return setError(result.error);
      setOpen(false);
      setSaved(true);
    });
  };

  if (saved) {
    return (
      <div className={`ride-alert-saved ${onCard ? "on-card" : ""}`} role="status">
        <span className="ride-alert-saved-icon" aria-hidden="true"><Check {...iconProps} size={onCard ? 14 : 16} strokeWidth={3} /></span>
        <span className="ride-alert-saved-text">
          <span>
            {/* On a card, the check says it; screen readers still hear it. */}
            {onCard ? <span className="visually-hidden">ההתראה נשמרה, </span> : <>ההתראה נשמרה,{" "}</>}
            <Link href="/alerts" className="ride-alert-saved-link">
              להתראות שלי <ArrowLeft {...iconProps} size={onCard ? 14 : 16} />
            </Link>
          </span>
          {!onCard && <small>נשלח לך מייל כשתהיה נסיעה מתאימה עם מקום פנוי.</small>}
        </span>
      </div>
    );
  }

  // On a card, short, to match the size of the other cards' "לפרטים והרשמה",
  // with the full ask in its name.
  const cardName = "עדכנו אותי כשיתפנה מקום";
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        aria-label={onCard ? cardName : undefined}
        title={onCard ? cardName : undefined}
        onClick={openForm}
      >
        <BellRing {...iconProps} size={18} /> {onCard ? "עדכנו אותי" : "עדכנו אותי כשתהיה נסיעה"}
      </button>
      {/* Portaled to <body>, like the other modal forms. */}
      {open && createPortal(
        <ModalForm
          icon={<BellRing {...iconProps} size={20} />}
          title="התראה על נסיעה"
          description="נשלח לך מייל כשנהגת תפרסם נסיעה חדשה שמתאימה, או כשיתפנה מקום בנסיעה מלאה שמתאימה. ההתראה בתוקף עד סוף תאריך הסיום, או 7 ימים בלי תאריכים."
          error={error}
          submitLabel={pending ? "שומרת…" : "שמירת ההתראה"}
          submitDisabled={pending}
          onSubmit={submit}
          onClose={() => setOpen(false)}
        >
          <div className="form-grid compact ride-alert-fields">
            <div className="field">
              <span>מאיפה</span>
              <MultiSelect label="מאיפה" values={fields.origins} onChange={set("origins")} options={options} allLabel="בחרי מקום" icon={<MapPin {...iconProps} size={20} />} />
            </div>
            <div className="field">
              <span>לאן</span>
              <MultiSelect label="לאן" values={fields.destinations} onChange={set("destinations")} options={options} allLabel="בחרי מקום" icon={<MapPin {...iconProps} size={20} />} />
            </div>
            <div className="field">
              <span>מתאריך</span>
              <DatePicker label="מתאריך" value={fields.startDate} onChange={set("startDate")} today={today} min={today} placeholder="מהיום" clearable />
            </div>
            <div className="field">
              <span>עד תאריך</span>
              <DatePicker label="עד תאריך" value={fields.endDate} onChange={set("endDate")} today={today} min={fields.startDate || today} placeholder="7 ימים" clearable />
            </div>
            <div className="field">
              <span>יציאה משעה</span>
              <TimePicker label="יציאה משעה" value={fields.fromTime} onChange={set("fromTime")} placeholder="כל שעה" />
            </div>
            <div className="field">
              <span>עד שעה</span>
              <TimePicker label="עד שעה" value={fields.untilTime} onChange={set("untilTime")} placeholder="כל שעה" />
            </div>
          </div>
          {/* The time picker has no "ניקוי" of its own. */}
          {(fields.fromTime || fields.untilTime) && (
            <button type="button" className="btn btn-secondary ride-alert-clear-times" onClick={() => setFields((f) => ({ ...f, fromTime: "", untilTime: "" }))}>
              כל שעה
            </button>
          )}
        </ModalForm>,
        document.body,
      )}
    </>
  );
}
