"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Plus, Route } from "lucide-react";
import { createGroup, updateGroup } from "@/app/(app)/admin/actions";
import { groupSchema, type GroupValues } from "@/lib/validation/group";
import type { Place } from "@/lib/admin/data";
import { ModalForm } from "@/components/ui/ModalForm";
import { Select } from "@/components/ui/Select";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";

const ENDS = [
  { name: "originId", label: "נקודת מוצא" },
  { name: "destinationId", label: "יעד" },
] as const;

type Props = {
  places: Place[];
  group?: { id: string; originId: string; destinationId: string };
};

// "קבוצה חדשה" / "עריכה" — the design's small modal: an origin and a
// destination, each picked from the list of places.
export function GroupDialog({ places, group }: Props) {
  const editing = Boolean(group);
  // The selects show the first places until others are picked, so start there.
  const initial = {
    originId: group?.originId ?? places[0]?.id ?? "",
    destinationId: group?.destinationId ?? places[1]?.id ?? "",
  };
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(0);
  const [pending, startTransition] = useTransition();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<GroupValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: initial,
  });
  const options = places.map((p) => ({ value: p.id, label: p.name }));
  const enoughPlaces = places.length >= 2;

  // Opened afresh each time: the list may have grown since the page loaded.
  const show = () => {
    reset(initial);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setServerError("");
    reset(initial);
  };

  const onSubmit = (values: GroupValues) =>
    startTransition(async () => {
      setServerError("");
      const result = group ? await updateGroup(group.id, values) : await createGroup(values);
      if (result.error) return setServerError(result.error);
      setOpen(false);
      if (!group) reset(initial);
      setDone((n) => n + 1);
    });

  return (
    <>
      {editing ? (
        <button type="button" className="btn btn-secondary" onClick={show}>עריכה</button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={show}><Plus {...iconProps} size={20} /> קבוצה חדשה</button>
      )}

      {open && (
        <ModalForm
          icon={<Route {...iconProps} size={20} />}
          title={editing ? "עריכת קבוצת נסיעה" : "יצירת קבוצת נסיעה"}
          description={enoughPlaces ? "בחרי מוצא ויעד מרשימת המקומות." : "קודם הוסיפי לפחות שני מקומות לרשימת המקומות."}
          error={serverError}
          submitLabel={pending ? "שומר..." : editing ? "שמירת השינויים" : "יצירת הקבוצה"}
          submitDisabled={pending || !enoughPlaces}
          onSubmit={handleSubmit(onSubmit)}
          onClose={close}
        >
          {enoughPlaces && (
            <div className="form-grid compact group-dialog-fields">
              {ENDS.map(({ name, label }) => (
                <div key={name} className="field">
                  <span>{label}</span>
                  <Controller
                    control={control}
                    name={name}
                    render={({ field }) => (
                      <Select label={label} value={field.value} onChange={field.onChange} options={options} icon={<MapPin {...iconProps} size={20} />} searchable />
                    )}
                  />
                  <FieldError message={errors[name]?.message} />
                </div>
              ))}
            </div>
          )}
        </ModalForm>
      )}
      <Toast message={done ? (editing ? "הקבוצה עודכנה" : "הקבוצה נוצרה בהצלחה") : ""} id={done} />
    </>
  );
}
