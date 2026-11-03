import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Phone } from "lucide-react";
import { FieldError } from "@/components/ui/FieldError";
import { iconProps } from "@/components/ui/icon";
import { profileSchema, VEHICLE_COLOR_MAX, VEHICLE_MODEL_MAX, type ProfileValues } from "@/lib/validation/profile";

// What onboarding and the profile screen share: the same form, the phone field
// and the car's model, color and seats.

export function useProfileForm(defaultValues: ProfileValues) {
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues });
  const hasVehicle = useWatch({ control: form.control, name: "hasVehicle" });
  return { ...form, hasVehicle };
}

type FieldsProps = { form: UseFormReturn<ProfileValues> };

export function PhoneField({ form, required = false }: FieldsProps & { required?: boolean }) {
  return (
    <label className={`field ${required ? "required" : ""}`}>
      <span>מספר טלפון</span>
      <div className="input-shell">
        <Phone {...iconProps} size={20} />
        <input {...form.register("phone")} type="tel" inputMode="tel" placeholder="050-000-0000" autoComplete="tel" />
      </div>
      <FieldError message={form.formState.errors.phone?.message} />
    </label>
  );
}

export function VehicleFields({ form }: FieldsProps) {
  const { register, formState: { errors } } = form;
  return (
    <>
      <label className="field">
        <span>סוג רכב</span>
        <div className="input-shell"><input {...register("vehicleModel")} placeholder="לדוגמה: יונדאי איוניק" maxLength={VEHICLE_MODEL_MAX} /></div>
        <FieldError message={errors.vehicleModel?.message} />
      </label>
      <label className="field">
        <span>צבע</span>
        <div className="input-shell"><input {...register("vehicleColor")} placeholder="לדוגמה: לבן" maxLength={VEHICLE_COLOR_MAX} /></div>
        <FieldError message={errors.vehicleColor?.message} />
      </label>
      <label className="field">
        <span>מספר מקומות</span>
        <div className="input-shell"><input {...register("vehicleSeats")} inputMode="numeric" /></div>
        <FieldError message={errors.vehicleSeats?.message} />
      </label>
    </>
  );
}
