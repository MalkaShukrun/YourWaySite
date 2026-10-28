import type { UseFormRegisterReturn } from "react-hook-form";
import { FieldError } from "@/components/ui/FieldError";
import { VEHICLE_COLOR_MAX, VEHICLE_MODEL_MAX } from "@/lib/validation/profile";

type Field = { input: UseFormRegisterReturn; error?: string };
type Props = { model: Field; color: Field; seats: Field };

// The car's model, color and seats — in onboarding and on the profile screen.
// Each form registers the inputs itself, so this works with either form.
export function VehicleFields({ model, color, seats }: Props) {
  return (
    <>
      <label className="field">
        <span>סוג רכב</span>
        <div className="input-shell"><input {...model.input} placeholder="לדוגמה: יונדאי איוניק" maxLength={VEHICLE_MODEL_MAX} /></div>
        <FieldError message={model.error} />
      </label>
      <label className="field">
        <span>צבע</span>
        <div className="input-shell"><input {...color.input} placeholder="לדוגמה: לבן" maxLength={VEHICLE_COLOR_MAX} /></div>
        <FieldError message={color.error} />
      </label>
      <label className="field">
        <span>מספר מקומות</span>
        <div className="input-shell"><input {...seats.input} inputMode="numeric" /></div>
        <FieldError message={seats.error} />
      </label>
    </>
  );
}
