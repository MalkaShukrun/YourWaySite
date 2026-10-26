"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, Landmark, Mail, Phone, User } from "lucide-react";
import { saveProfile } from "@/app/(app)/profile/actions";
import { profileSchema, type ProfileValues } from "@/lib/validation/profile";
import { Toast } from "@/components/ui/Toast";
import { VehicleFields } from "@/components/profile/VehicleFields";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";
import { useHydrated } from "@/components/ui/useHydrated";

type Props = { initials: string; email: string; defaults: ProfileValues };

// Personal details, vehicle and payment account — the design's profile panel.
export function ProfileForm({ initials, email, defaults }: Props) {
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(0);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const hasVehicle = useWatch({ control, name: "hasVehicle" });

  const onSubmit = (values: ProfileValues) =>
    startTransition(async () => {
      setServerError("");
      const result = await saveProfile(values);
      if (result.error) return setServerError(result.error);
      setSaved((n) => n + 1);
    });

  return (
    <form className="panel profile-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="profile-head">
        <div className="avatar avatar-sand avatar-large">{initials}</div>
        <div>
          <h2>עריכת פרטים אישיים</h2>
          <span>הפרטים המשמשים ליצירת קשר ותיאום נסיעות</span>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>שם מלא</span>
          <div className="input-shell"><User {...iconProps} size={20} /><input {...register("fullName")} autoComplete="name" /></div>
          <FieldError message={errors.fullName?.message} />
        </label>
        <label className="field">
          <span>כתובת דוא״ל</span>
          <div className="input-shell is-readonly"><Mail {...iconProps} size={20} /><input value={email} readOnly dir="ltr" /></div>
        </label>
        <label className="field">
          <span>מספר טלפון</span>
          <div className="input-shell"><Phone {...iconProps} size={20} /><input {...register("phone")} type="tel" inputMode="tel" placeholder="050-000-0000" autoComplete="tel" /></div>
          <FieldError message={errors.phone?.message} />
        </label>
      </div>

      <div className="vehicle-section profile-vehicle">
        <div>
          <h3><Car {...iconProps} size={20} /> פרטי הרכב שלי</h3>
          <span>הפרטים יוצגו לטרמפיסטיות</span>
        </div>
        {hasVehicle ? (
          <button type="button" className="btn btn-ghost" onClick={() => setValue("hasVehicle", false)}>הסרת הרכב</button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setValue("hasVehicle", true)}>הוספת רכב</button>
        )}
      </div>
      {hasVehicle && (
        <div className="form-grid compact profile-subgrid">
          <VehicleFields
            model={{ input: register("vehicleModel"), error: errors.vehicleModel?.message }}
            color={{ input: register("vehicleColor"), error: errors.vehicleColor?.message }}
            seats={{ input: register("vehicleSeats"), error: errors.vehicleSeats?.message }}
          />
        </div>
      )}

      <div className="bank-section">
        <div className="bank-section-head">
          <div>
            <h3><Landmark {...iconProps} size={20} /> פרטי חשבון לקבלת תשלום</h3>
            <span>לנהגות — הפרטים יוצגו לטרמפיסטית שנרשמה לנסיעה. השאירי ריק אם אינך מציעה נסיעות.</span>
          </div>
        </div>
        <div className="form-grid compact">
          <label className="field">
            <span>שם בעלת החשבון</span>
            <div className="input-shell"><input {...register("bankAccountName")} /></div>
            <FieldError message={errors.bankAccountName?.message} />
          </label>
          <label className="field">
            <span>שם הבנק</span>
            <div className="input-shell"><input {...register("bankName")} placeholder="לדוגמה: בנק הפועלים" /></div>
            <FieldError message={errors.bankName?.message} />
          </label>
          <label className="field">
            <span>מספר סניף</span>
            <div className="input-shell"><input {...register("bankBranch")} inputMode="numeric" dir="ltr" /></div>
            <FieldError message={errors.bankBranch?.message} />
          </label>
          <label className="field">
            <span>מספר חשבון</span>
            <div className="input-shell"><input {...register("bankAccount")} inputMode="numeric" dir="ltr" /></div>
            <FieldError message={errors.bankAccount?.message} />
          </label>
        </div>
      </div>

      {serverError && <p className="auth-error" role="alert">{serverError}</p>}
      <div className="profile-save">
        <button type="submit" className="btn btn-primary" disabled={!hydrated || pending}>{pending ? "שומר..." : "שמירת שינויים"}</button>
      </div>
      <Toast message={saved ? "הפרטים נשמרו בהצלחה" : ""} id={saved} />
    </form>
  );
}
