"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addOtpEmail, newOtpCode, removeOtpEmail } from "@/app/(app)/admin/actions";

// Only a hash is stored, so the code can be seen here once, right after it's made.
function CodeNote({ code }: { code: string }) {
  return <p className="otp-code-note" role="status">הקוד האישי: <strong dir="ltr">{code}</strong> — העתיקי ושלחי אליה. הוא לא יוצג שוב.</p>;
}

export function OtpEmailForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      setCode("");
      const result = await addOtpEmail(email);
      if (result.error) return setError(result.error);
      setCode(result.code ?? "");
      setEmail("");
    });
  };

  return (
    <form className="otp-email-form" onSubmit={onSubmit} noValidate>
      <div className="input-shell">
        <input type="email" dir="ltr" aria-label="כתובת מייל" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending || !email.trim()}>{pending ? "מוסיף..." : "הוספה"}</button>
      {code && <CodeNote code={code} />}
      {error && <p className="form-alert" role="alert">{error}</p>}
    </form>
  );
}

// A new code replaces the old one. Removing an address keeps her account, rides
// and bookings; she just can't sign in with a code any more.
export function OtpEmailActions({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string; code?: string }>) =>
    startTransition(async () => {
      setError("");
      setCode("");
      const result = await action();
      if (result.error) return setError(result.error);
      setCode(result.code ?? "");
    });

  return (
    <>
      <div className="otp-email-actions">
        <button type="button" className="btn btn-secondary" onClick={() => run(() => newOtpCode(email))} disabled={pending} aria-label={`קוד חדש ל־${email}`}>קוד חדש</button>
        <button type="button" className="btn btn-secondary" onClick={() => run(() => removeOtpEmail(email))} disabled={pending} aria-label={`הסרת ${email}`}>הסרה</button>
      </div>
      {code && <CodeNote code={code} />}
      {error && <p className="form-alert" role="alert">{error}</p>}
    </>
  );
}
