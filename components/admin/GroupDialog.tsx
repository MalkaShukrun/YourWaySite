"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Plus, Route } from "lucide-react";
import { createGroup, updateGroup } from "@/app/(app)/admin/actions";
import { groupSchema, type GroupValues } from "@/lib/validation/group";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";

type Props = { group?: { id: string; origin: string; destination: string } };

// "קבוצה חדשה" / "עריכה" — the design's small modal with origin and destination.
export function GroupDialog({ group }: Props) {
  const editing = Boolean(group);
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(0);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<GroupValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: { origin: group?.origin ?? "", destination: group?.destination ?? "" },
  });

  const close = () => {
    setOpen(false);
    setServerError("");
    reset({ origin: group?.origin ?? "", destination: group?.destination ?? "" });
  };

  const onSubmit = (values: GroupValues) =>
    startTransition(async () => {
      setServerError("");
      const result = group ? await updateGroup(group.id, values) : await createGroup(values);
      if (result.error) return setServerError(result.error);
      setOpen(false);
      if (!group) reset({ origin: "", destination: "" });
      setDone((n) => n + 1);
    });

  return (
    <>
      {editing ? (
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>עריכה</button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus {...iconProps} size={20} /> קבוצה חדשה</button>
      )}

      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <form
            className="modal-card small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-dialog-title"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <button type="button" className="modal-close" onClick={close} aria-label="סגירה">×</button>
            <span className="modal-icon"><Route {...iconProps} size={20} /></span>
            <h2 id="group-dialog-title">{editing ? "עריכת קבוצת נסיעה" : "יצירת קבוצת נסיעה"}</h2>
            <p>הגדירי מוצא ויעד אחידים כדי למנוע כפילויות.</p>
            <div className="form-grid compact group-dialog-fields">
              <label className="field">
                <span>נקודת מוצא</span>
                <div className="input-shell"><MapPin {...iconProps} size={20} /><input {...register("origin")} placeholder="לדוגמה: בית שמש" autoFocus /></div>
                <FieldError message={errors.origin?.message} />
              </label>
              <label className="field">
                <span>יעד</span>
                <div className="input-shell"><MapPin {...iconProps} size={20} /><input {...register("destination")} placeholder="לדוגמה: ירושלים" /></div>
                <FieldError message={errors.destination?.message} />
              </label>
            </div>
            {serverError && <p className="form-alert" role="alert">{serverError}</p>}
            <button type="submit" className="btn btn-primary full-button" disabled={pending}>
              {pending ? "שומר..." : editing ? "שמירת השינויים" : "יצירת הקבוצה"}
            </button>
          </form>
        </div>
      )}
      <Toast message={done ? (editing ? "הקבוצה עודכנה" : "הקבוצה נוצרה בהצלחה") : ""} id={done} />
    </>
  );
}
