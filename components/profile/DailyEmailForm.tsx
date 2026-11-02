"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { saveDailyEmail } from "@/app/(app)/profile/actions";
import { dailyEmailSchema, type DailyEmailValues } from "@/lib/validation/profile";
import { Toast } from "@/components/ui/Toast";
import { TimePicker } from "@/components/ui/TimePicker";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";
import { useHydrated } from "@/components/ui/useHydrated";

type Props = { email: string; defaults: DailyEmailValues };

// The daily email with tomorrow's passengers — its own form, because the
// profile form's schema is shared with onboarding.
export function DailyEmailForm({ email, defaults }: Props) {
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(0);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<DailyEmailValues>({ resolver: zodResolver(dailyEmailSchema), defaultValues: defaults });
  const enabled = useWatch({ control, name: "enabled" });

  const onSubmit = (values: DailyEmailValues) =>
    startTransition(async () => {
      setServerError("");
      const result = await saveDailyEmail(values);
      if (result.error) return setServerError(result.error);
      setSaved((n) => n + 1);
    });

  return (
    <form className="panel profile-panel daily-email-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="vehicle-section">
        <div>
          <h3><Mail {...iconProps} size={20} /> מייל יומי לנהגות</h3>
          <span>רשימת הנוסעות של מחר, עם טלפון, דוא״ל ותחנת עלייה</span>
        </div>
        <button type="button" className={`btn ${enabled ? "btn-secondary" : "btn-ghost"}`} onClick={() => setValue("enabled", !enabled)}>
          {enabled ? "פעיל" : "כבוי"}
        </button>
      </div>
      {enabled && (
        <div className="form-grid compact profile-subgrid">
          <div className="field">
            <span>שעת השליחה</span>
            <Controller
              control={control}
              name="time"
              render={({ field }) => <TimePicker label="שעת השליחה" value={field.value} onChange={field.onChange} />}
            />
            <FieldError message={errors.time?.message} />
            <p className="daily-email-note">
              המייל יישלח אל <span dir="ltr">{email}</span> עד כ־5 דקות אחרי השעה שבחרת, פעם ביום. אם למחר אין נוסעות
              רשומות, לא יישלח מייל.
            </p>
          </div>
        </div>
      )}

      {serverError && <p className="auth-error" role="alert">{serverError}</p>}
      <div className="profile-save">
        <button type="submit" className="btn btn-primary" disabled={!hydrated || pending}>{pending ? "שומר..." : "שמירת הגדרות המייל"}</button>
      </div>
      <Toast message={saved ? "הגדרות המייל נשמרו" : ""} id={saved} />
    </form>
  );
}
