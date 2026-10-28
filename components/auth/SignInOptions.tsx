"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const PRIVACY_ERROR = "יש לאשר את מדיניות הפרטיות כדי להמשיך.";

// Google is the only way in. It returns through /auth/callback, which sends
// new users to onboarding.
export function SignInOptions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  async function signInWithGoogle() {
    if (!acceptPrivacy) return setError(PRIVACY_ERROR);
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
          checked={acceptPrivacy}
          onChange={(event) => {
            setAcceptPrivacy(event.target.checked);
            setError("");
          }}
        />
        <span>
          קראתי ואני מסכימה ל<Link href="/privacy">מדיניות הפרטיות</Link>
        </span>
      </label>
      <button className="google-button" onClick={signInWithGoogle} disabled={loading}>
        <span className="google-g">G</span>
        {loading ? "מעביר ל־Google…" : "הצטרפות עם Google"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </>
  );
}
