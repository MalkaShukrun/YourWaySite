"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("ההתחברות עם Google נכשלה. נסי שוב.");
      setLoading(false);
    }
  }

  return (
    <>
      <button className="google-button" onClick={signIn} disabled={loading}>
        <span className="google-g">G</span>
        {loading ? "מעבירה ל־Google…" : "הצטרפות עם Google"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </>
  );
}
