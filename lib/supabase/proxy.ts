import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/auth/public-origin";

const PUBLIC_PATHS = ["/login", "/auth", "/privacy", "/terms"];

// Refreshes the Supabase session cookie on every request and sends
// signed-out visitors to /login. Role checks (admin) happen on the server
// in lib/auth/session.ts — this is only an optimistic check.
export async function updateSession(request: NextRequest) {
  // Supabase falls back to the Site URL (e.g. "/?code=…") when /auth/callback
  // isn't in its Redirect URLs list — hand the code to the callback anyway.
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/auth/callback" && (searchParams.has("code") || searchParams.has("error_description"))) {
    return NextResponse.redirect(new URL(`/auth/callback${request.nextUrl.search}`, publicOrigin(request)));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);

  const isPublic = PUBLIC_PATHS.some((publicPath) => pathname.startsWith(publicPath));

  if (!isSignedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", publicOrigin(request)));
  }

  if (isSignedIn) await recordVisit(supabase, request, response, data!.claims.sub);

  return response;
}

const VISIT_COOKIE = "yw_visit";

// Marks the member as having come in today (Israel's date), for the admin
// page's daily charts (0042). The cookie keeps it to one call a day.
async function recordVisit(supabase: SupabaseClient, request: NextRequest, response: NextResponse, userId: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const visit = `${userId}:${today}`;
  if (request.cookies.get(VISIT_COOKIE)?.value === visit) return;

  const { error } = await supabase.rpc("record_visit");
  if (error) {
    console.error("recordVisit:", error.message);
    return;
  }
  response.cookies.set(VISIT_COOKIE, visit, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 2 * 86_400 });
}
