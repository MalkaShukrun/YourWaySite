"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, Phone, User } from "lucide-react";
import { onboardingSchema, type OnboardingValues } from "@/lib/validation/profile";
import { completeProfile } from "@/app/(auth)/login/actions";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";

type Props = { defaultName: string };

// The email comes from Google and isn't editable here.
export function OnboardingModal({ defaultName }: Props) {
  const [serverError, setServerError] = useState("");
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: defaultName,
      phone: "",
      hasVehicle: false,
      vehicleModel: "",
      vehicleColor: "",
      vehicleSeats: "4",
    },
  });
  const hasVehicle = useWatch({ control, name: "hasVehicle" });

  const onSubmit = (values: OnboardingValues) =>
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
            <div className="input-shell"><input {...register("fullName")} autoComplete="name" /></div>
            <FieldError message={errors.fullName?.message} />
          </label>
          <label className="field required">
            <span>מספר טלפון</span>
            <div className="input-shell">
              <Phone {...iconProps} size={20} />
              <input {...register("phone")} type="tel" inputMode="tel" placeholder="050-000-0000" autoComplete="tel" />
            </div>
            <FieldError message={errors.phone?.message} />
          </label>
        </div>

        {hasVehicle ? (
          <div className="vehicle-fields">
            <div className="form-grid compact">
              <label className="field">
                <span>סוג רכב</span>
                <div className="input-shell"><input {...register("vehicleModel")} placeholder="לדוגמה: יונדאי איוניק" /></div>
                <FieldError message={errors.vehicleModel?.message} />
              </label>
              <label className="field">
                <span>צבע</span>
                <div className="input-shell"><input {...register("vehicleColor")} placeholder="לדוגמה: לבן" /></div>
                <FieldError message={errors.vehicleColor?.message} />
              </label>
              <label className="field">
                <span>מספר מקומות</span>
                <div className="input-shell"><input {...register("vehicleSeats")} inputMode="numeric" /></div>
                <FieldError message={errors.vehicleSeats?.message} />
              </label>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setValue("hasVehicle", false)}>
              בלי רכב כרגע
            </button>
          </div>
        ) : (
          <div className="optional-car">
            <Car {...iconProps} size={20} />
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
        <button type="submit" className="btn btn-primary full-button" disabled={pending}>
          {pending ? "שומרת…" : "שמירה וכניסה למערכת"}
        </button>
      </form>
    </div>
  );
}
