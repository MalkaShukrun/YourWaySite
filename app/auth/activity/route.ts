// IdleLogout's ping while the user is active (spec A8). The proxy records the
// time on the way in, or answers with a redirect to /login if she was idle too long.
export function POST() {
  return new Response(null, { status: 204 });
}
