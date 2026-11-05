"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Plus } from "lucide-react";
import { createPlace, updatePlace } from "@/app/(app)/admin/actions";
import { placeSchema, PLACE_PART_MAX, type PlaceValues } from "@/lib/validation/place";
import { ModalForm } from "@/components/ui/ModalForm";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";

type Props = { place?: { id: string; city: string; neighborhood: string } };

// "מקום חדש" / "עריכה" — a place on the list: a city and a neighborhood in it.
export function PlaceDialog({ place }: Props) {
  const editing = Boolean(place);
  const initial = { city: place?.city ?? "", neighborhood: place?.neighborhood ?? "" };
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(0);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PlaceValues>({
    resolver: zodResolver(placeSchema),
    defaultValues: initial,
  });

  const close = () => {
    setOpen(false);
    setServerError("");
    reset(initial);
  };

  const onSubmit = (values: PlaceValues) =>
    startTransition(async () => {
      setServerError("");
      const result = place ? await updatePlace(place.id, values) : await createPlace(values);
      if (result.error) return setServerError(result.error);
      setOpen(false);
      if (!place) reset(initial);
      setDone((n) => n + 1);
    });

  return (
    <>
      {editing ? (
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>עריכה</button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus {...iconProps} size={20} /> מקום חדש</button>
      )}

      {open && (
        <ModalForm
          icon={<MapPin {...iconProps} size={20} />}
          title={editing ? "עריכת מקום" : "הוספת מקום"}
          description={editing ? "השם החדש יופיע בכל הקבוצות של המקום." : "עיר ושכונה או אזור בה. הקבוצות נבחרות מרשימת המקומות."}
          error={serverError}
          submitLabel={pending ? "שומר..." : editing ? "שמירת השינויים" : "הוספת המקום"}
          submitDisabled={pending}
          onSubmit={handleSubmit(onSubmit)}
          onClose={close}
        >
          <div className="form-grid compact group-dialog-fields">
            <label className="field">
              <span>עיר</span>
              <div className="input-shell"><MapPin {...iconProps} size={20} /><input {...register("city")} placeholder="לדוגמה: בית שמש" maxLength={PLACE_PART_MAX} autoFocus /></div>
              <FieldError message={errors.city?.message} />
            </label>
            <label className="field">
              <span>שכונה או אזור</span>
              <div className="input-shell"><MapPin {...iconProps} size={20} /><input {...register("neighborhood")} placeholder="לדוגמה: רמה ג" maxLength={PLACE_PART_MAX} /></div>
              <FieldError message={errors.neighborhood?.message} />
            </label>
          </div>
        </ModalForm>
      )}
      <Toast message={done ? (editing ? "המקום עודכן" : "המקום נוסף לרשימה") : ""} id={done} />
    </>
  );
}
