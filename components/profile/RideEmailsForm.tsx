"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing } from "lucide-react";
import { saveRideEmails } from "@/app/(app)/profile/actions";
import { rideEmailsSchema, type RideEmailsValues } from "@/lib/validation/profile";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { useHydrated } from "@/components/ui/useHydrated";

type Props = { email: string; defaults: RideEmailsValues };

// Emails about her own rides (spec A7), as a passenger and as a driver — its
// own form, like the daily email's.
export function RideEmailsForm({ email, defaults }: Props) {
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(0);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const { handleSubmit, control, setValue } = useForm<RideEmailsValues>({
    resolver: zodResolver(rideEmailsSchema),
    defaultValues: defaults,
  });
  const enabled = useWatch({ control, name: "enabled" });

  const onSubmit = (values: RideEmailsValues) =>
    startTransition(async () => {
      setServerError("");
      const result = await saveRideEmails(values);
      if (result.error) return setServerError(result.error);
      setSaved((n) => n + 1);
    });

  return (
    <form className="panel profile-panel daily-email-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="vehicle-section">
        <div>
          <h3><BellRing {...iconProps} size={20} /> מיילים על הנסיעות שלי</h3>
          <span>
            כשאת נרשמת לנסיעה או מבטלת הרשמה, כשהנהגת מבטלת נסיעה שנרשמת אליה, וכשנוסעת מבטלת הרשמה לנסיעה שאת
            נוהגת בה. נשלחים אל <span dir="ltr">{email}</span> עד כ־5 דקות אחרי מה שקרה.
          </span>
        </div>
        <button
          type="button"
          className={`btn outlined ${enabled ? "btn-secondary" : "btn-ghost"}`}
          aria-label="מיילים על הנסיעות שלי"
          aria-pressed={enabled}
          onClick={() => setValue("enabled", !enabled)}
        >
          {enabled ? "פעיל" : "כבוי"}
        </button>
      </div>

      {serverError && <p className="auth-error" role="alert">{serverError}</p>}
      <div className="profile-save">
        <button type="submit" className="btn btn-primary" disabled={!hydrated || pending}>{pending ? "שומר..." : "שמירת הגדרות ההתראות"}</button>
      </div>
      <Toast message={saved ? "הגדרות ההתראות נשמרו" : ""} id={saved} />
    </form>
  );
}
