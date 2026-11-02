"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EmailCodeSignIn } from "@/components/auth/EmailCodeSignIn";

const CONSENT_ERROR = "יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.";

// Google is the way in, and it returns through /auth/callback, which sends new
// users to onboarding. Addresses an admin approved can use a personal code.
export function SignInOptions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  async function signInWithGoogle() {
    if (!accepted) return setError(CONSENT_ERROR);
    setLoading(true);
    setError("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Ask which account every time, so signing out doesn't just bring
        // back the Google account the browser is still signed in to.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError("ההתחברות עם Google נכשלה. נסי שוב.");
      setLoading(false);
    }
  }

  return (
    <>
      <label className="privacy-consent">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => {
            setAccepted(event.target.checked);
            setError("");
          }}
        />
        <span>
          קראתי ואני מסכימה ל<Link href="/terms">תנאי השימוש</Link> ול<Link href="/privacy">מדיניות הפרטיות</Link>
        </span>
      </label>
      <button className="google-button" onClick={signInWithGoogle} disabled={loading}>
        <span className="google-g">G</span>
        {loading ? "מעביר ל־Google…" : "הצטרפות עם Google"}
      </button>
      <EmailCodeSignIn accepted={accepted} onNotAccepted={() => setError(CONSENT_ERROR)} />
      {error && <p className="auth-error" role="alert">{error}</p>}
    </>
  );
}
