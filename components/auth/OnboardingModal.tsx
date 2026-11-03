"use client";

import { useState, useTransition } from "react";
import { Car, User } from "lucide-react";
import { FULL_NAME_MAX, type ProfileValues } from "@/lib/validation/profile";
import { completeProfile, signOut } from "@/app/(auth)/login/actions";
import { PhoneField, useProfileForm, VehicleFields } from "@/components/profile/ProfileFields";
import { carIconProps, iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";
import { useHydrated } from "@/components/ui/useHydrated";

type Props = { defaultName: string };

// The email comes from the sign-in and isn't editable here.
export function OnboardingModal({ defaultName }: Props) {
  const [serverError, setServerError] = useState("");
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const form = useProfileForm({
    fullName: defaultName,
    phone: "",
    hasVehicle: false,
    vehicleModel: "",
    vehicleColor: "",
    vehicleSeats: "4",
  });
  const { register, handleSubmit, setValue, formState: { errors }, hasVehicle } = form;

  const onSubmit = (values: ProfileValues) =>
    startTransition(async () => {
      setServerError("");
      const result = await completeProfile(values);
      if (result?.error) setServerError(result.error);
    });

  return (
    <div className="modal-backdrop">
      <form
        className="modal-card onboarding-card"
        onSubmit={handleSubmit(onSubmit)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        noValidate
      >
        <span className="modal-icon"><User {...iconProps} size={20} /></span>
        <h2 id="onboarding-title">עוד רגע ואת בדרך</h2>
        <p>השלימי כמה פרטים כדי שנוכל לחבר אותך לנסיעות המתאימות.</p>

        <div className="form-grid">
          <label className="field">
            <span>שם מלא</span>
            <div className="input-shell"><input {...register("fullName")} autoComplete="name" maxLength={FULL_NAME_MAX} /></div>
            <FieldError message={errors.fullName?.message} />
          </label>
          <PhoneField form={form} required />
        </div>

        {hasVehicle ? (
          <div className="vehicle-fields">
            <div className="form-grid compact">
              <VehicleFields form={form} />
            </div>
            <button type="button" className="btn btn-ghost outlined" onClick={() => setValue("hasVehicle", false)}>
              בלי רכב כרגע
            </button>
          </div>
        ) : (
          <div className="optional-car">
            <Car {...carIconProps} size={20} />
            <div>
              <strong>רוצה גם להציע נסיעות?</strong>
              <span>ניתן להוסיף פרטי רכב עכשיו או בהמשך בפרופיל.</span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setValue("hasVehicle", true)}>
              הוספת רכב
            </button>
          </div>
        )}

        {serverError && <p className="auth-error" role="alert">{serverError}</p>}
        <button type="submit" className="btn btn-primary full-button" disabled={!hydrated || pending}>
          {pending ? "שומר…" : "שמירה וכניסה למערכת"}
        </button>
        {/* Signed in with the wrong Google account? Back to the login screen. */}
        <button type="button" className="btn btn-ghost full-button onboarding-switch" disabled={pending} onClick={() => startTransition(() => signOut())}>
          לא את? התחברות עם חשבון אחר
        </button>
      </form>
    </div>
  );
}
