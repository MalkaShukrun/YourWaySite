"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithCode } from "@/app/(auth)/login/actions";
import { SUPPORT_EMAIL } from "@/lib/site/support";

// For women without a Google account: the personal code they got from the
// admin. The error is the same for any wrong address or code, so the form can't
// be used to find out who is on the list.
export function EmailCodeSignIn({ accepted, onNotAccepted }: { accepted: boolean; onNotAccepted: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <button type="button" className="email-code-link" onClick={() => setOpen(true)}>אין לך חשבון Google? כניסה עם קוד אישי</button>;
  }

  // The clipboard can be refused, so the address is shown either way.
  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopyNote("כתובת המייל הועתקה:");
    } catch {
      setCopyNote("כתבי לנו אל:");
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!accepted) return onNotAccepted();
    startTransition(async () => {
      setError("");
      const result = await signInWithCode(email, code);
      if (result.error) return setError(result.error);
      // /login sends her on to onboarding or to her home page.
      router.refresh();
    });
  };

  return (
    <form className="email-code-form" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span>כתובת המייל</span>
        <div className="input-shell"><input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
      </label>
      <label className="field">
        <span>הקוד האישי</span>
        <div className="input-shell"><input type="password" dir="ltr" inputMode="numeric" autoComplete="current-password" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} /></div>
      </label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary full-button" disabled={pending || !email.trim() || !code.trim()}>
        {pending ? "בודק..." : "כניסה"}
      </button>
      {/* The contact form is for signed-in users, so this goes by email. */}
      <button type="button" className="email-code-link" onClick={copySupportEmail}>שכחת את הקוד? שלחי לנו מייל</button>
      {copyNote && <p className="email-code-note" role="status">{copyNote} <span dir="ltr">{SUPPORT_EMAIL}</span></p>}
    </form>
  );
}
