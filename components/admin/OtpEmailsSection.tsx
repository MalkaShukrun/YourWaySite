import { Mail } from "lucide-react";
import { getOtpEmails } from "@/lib/admin/data";
import { OtpEmailActions, OtpEmailForm } from "@/components/admin/OtpEmailForm";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { iconProps } from "@/components/ui/icon";

// The addresses that may sign in with a personal code instead of Google.
// Render only for admins (the caller checks with requireAdmin).
export async function OtpEmailsSection() {
  const emails = await getOtpEmails();

  return (
    <CollapsiblePanel title="כניסה עם קוד אישי" subtitle="למשתמשות בלי חשבון Google. הוספת כתובת יוצרת לה חשבון וקוד קבוע, שאת מעבירה אליה">
      <OtpEmailForm />
      {emails.length === 0 ? (
        <div className="empty-state"><strong>עדיין אין כתובות</strong><span>הוסיפי כתובת מייל כדי ליצור לה קוד אישי.</span></div>
      ) : (
        emails.map(({ email }) => (
          <div key={email} className="group-row otp-email-row">
            <span className="route-badge"><Mail {...iconProps} size={20} /></span>
            <div><strong dir="ltr">{email}</strong></div>
            <OtpEmailActions email={email} />
          </div>
        ))
      )}
    </CollapsiblePanel>
  );
}
