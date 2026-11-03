// Supabase Edge Function: emails drivers their passengers for tomorrow. pg_cron
// calls it every 5 minutes (supabase/snippets/daily_passenger_email_cron.sql).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase; CRON_SECRET,
// GMAIL_USER, GMAIL_APP_PASSWORD and SITE_URL with `supabase secrets set`.

import { buildEmail, sendDailyEmails, type DailyEmail } from "./email.ts";
import { gmailSender } from "./mailer.ts";

// The editor checks this file as plain TypeScript, without Deno's own types.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const env = (name: string) => Deno.env.get(name) ?? "";

// GMAIL_TLS_CA (base64) is only set by the local email test.
const sendMail = gmailSender(env("GMAIL_USER"), env("GMAIL_APP_PASSWORD"), atob(env("GMAIL_TLS_CA")));

const rest = (path: string, init: RequestInit) =>
  fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
  });

async function claim() {
  const response = await rest("rpc/claim_daily_passenger_emails", { method: "POST", body: "{}" });
  if (!response.ok) throw new Error(`claim failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as DailyEmail[];
}

// Keeps the ride date for the retry, so a send that fails just before
// midnight is still tried after it (0035).
async function release(email: DailyEmail) {
  const query = `id=eq.${email.driver_id}&daily_email_sent_for=eq.${email.ride_date}`;
  const response = await rest(`profiles?${query}`, {
    method: "PATCH",
    body: JSON.stringify({ daily_email_retry_for: email.ride_date }),
  });
  if (!response.ok) console.error("daily-passenger-email: release failed", email.driver_id, response.status);
}

const israelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

async function send(email: DailyEmail) {
  await sendMail({ to: email.driver_email, ...buildEmail(email, env("SITE_URL"), israelToday()) });
}

Deno.serve(async (request) => {
  const secret = env("CRON_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await sendDailyEmails({
      claim,
      send,
      release,
      wait: () => new Promise((resolve) => setTimeout(resolve, 600)),
    });
    return Response.json(result);
  } catch (error) {
    console.error("daily-passenger-email:", error);
    return new Response("Failed", { status: 500 });
  }
});
