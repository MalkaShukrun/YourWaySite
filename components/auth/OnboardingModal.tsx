"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, Phone, User } from "lucide-react";
import { onboardingSchema, type OnboardingValues } from "@/lib/validation/profile";
import { completeProfile } from "@/app/(auth)/login/actions";

type Props = { defaultName: string; defaultEmail: string };

export function OnboardingModal({ defaultName, defaultEmail }: Props) {
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
      email: defaultEmail,
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
        <span className="modal-icon"><User className="icon" size={20} strokeWidth={1.8} /></span>
        <h2 id="onboarding-title">עוד רגע ואת בדרך</h2>
        <p>השלימי כמה פרטים כדי שנוכל לחבר אותך לנסיעות המתאימות.</p>

        <div className="form-grid">
          <label className="field">
            <span>שם מלא</span>
            <div className="input-shell"><input {...register("fullName")} autoComplete="name" /></div>
            {errors.fullName && <small className="field-error">{errors.fullName.message}</small>}
          </label>
          <label className="field">
            <span>כתובת דוא״ל</span>
            <div className="input-shell"><input {...register("email")} type="email" dir="ltr" autoComplete="email" /></div>
            {errors.email && <small className="field-error">{errors.email.message}</small>}
          </label>
          <label className="field required">
            <span>מספר טלפון</span>
            <div className="input-shell">
              <Phone className="icon" size={20} strokeWidth={1.8} />
              <input {...register("phone")} type="tel" inputMode="tel" placeholder="050-000-0000" autoComplete="tel" />
            </div>
            {errors.phone && <small className="field-error">{errors.phone.message}</small>}
          </label>
        </div>

        {hasVehicle ? (
          <div className="vehicle-fields">
            <div className="form-grid compact">
              <label className="field">
                <span>סוג רכב</span>
                <div className="input-shell"><input {...register("vehicleModel")} placeholder="לדוגמה: יונדאי איוניק" /></div>
                {errors.vehicleModel && <small className="field-error">{errors.vehicleModel.message}</small>}
              </label>
              <label className="field">
                <span>צבע</span>
                <div className="input-shell"><input {...register("vehicleColor")} placeholder="לדוגמה: לבן" /></div>
                {errors.vehicleColor && <small className="field-error">{errors.vehicleColor.message}</small>}
              </label>
              <label className="field">
                <span>מספר מקומות</span>
                <div className="input-shell"><input {...register("vehicleSeats")} inputMode="numeric" /></div>
                {errors.vehicleSeats && <small className="field-error">{errors.vehicleSeats.message}</small>}
              </label>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setValue("hasVehicle", false)}>
              בלי רכב כרגע
            </button>
          </div>
        ) : (
          <div className="optional-car">
            <Car className="icon" size={20} strokeWidth={1.8} />
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
