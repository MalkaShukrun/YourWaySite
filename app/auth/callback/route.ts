import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathFor, needsOnboarding } from "@/lib/auth";

// Google OAuth returns here with ?code=… — exchange it for a session,
// then send the user to onboarding or to their role's home page.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = await getCurrentUser();
      if (user) {
        const next = needsOnboarding(user) ? "/login" : homePathFor(user);
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
