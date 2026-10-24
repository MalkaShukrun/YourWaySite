import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathFor, needsOnboarding } from "@/lib/auth";

// Google OAuth returns here with ?code=… — exchange it for a session,
// then send the user to onboarding or to their role's home page.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  // Supabase or Google refused the login (e.g. provider misconfigured).
  let reason = searchParams.get("error_description") ?? searchParams.get("error") ?? "missing code";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = await getCurrentUser();
      if (user) {
        const next = needsOnboarding(user) ? "/login" : homePathFor(user);
        return NextResponse.redirect(`${origin}${next}`);
      }
      reason = "no user after sign-in";
    } else {
      reason = error.message;
    }
  }

  console.error("[auth/callback] Google sign-in failed:", reason);
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
}
