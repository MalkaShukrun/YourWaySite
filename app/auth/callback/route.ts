import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathFor, needsOnboarding } from "@/lib/auth";

// A relative Location: the browser resolves it against the address it is on,
// so the hosting proxy's internal one (https://localhost:10000) never leaks.
const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } });

// Google OAuth returns here with ?code=… — exchange it for a session,
// then send the user to onboarding or to their role's home page.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
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
        return redirectTo(next);
      }
      reason = "no user after sign-in";
    } else {
      reason = error.message;
    }
  }

  console.error("[auth/callback] Google sign-in failed:", reason);
  return redirectTo(`/login?error=${encodeURIComponent(reason)}`);
}
