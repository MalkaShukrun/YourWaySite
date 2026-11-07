// Supabase Edge Function: emails drivers their passengers for tomorrow, and
// members the emails about their own rides (0043_ride_emails.sql). pg_cron
// calls it every 5 minutes (supabase/snippets/daily_passenger_email_cron.sql).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase; CRON_SECRET,
// GMAIL_USER, GMAIL_APP_PASSWORD and SITE_URL with `supabase secrets set`.

import { buildEmail, type DailyEmail } from "./email.ts";
import { gmailSender } from "./mailer.ts";
import { buildRideEmail, type RideEmail } from "./ride-emails.ts";
import { sendEmails } from "./send.ts";

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

async function claimFrom<T>(fn: string) {
  const response = await rest(`rpc/${fn}`, { method: "POST", body: "{}" });
  if (!response.ok) throw new Error(`claim failed: ${fn} ${response.status} ${await response.text()}`);
  return (await response.json()) as T[];
}

// The daily emails first: a driver claimed for one now has nothing new for an
// update. Those are already marked as sent, so a failed update claim mustn't
// stop them going out.
async function claimDaily() {
  const daily = await claimFrom<DailyEmail>("claim_daily_passenger_emails");
  try {
    return [...daily, ...(await claimFrom<DailyEmail>("claim_passenger_update_emails"))];
  } catch (error) {
    console.error("daily-passenger-email:", error);
    return daily;
  }
}

// A daily email keeps its ride date for the retry, so a send that fails just
// before midnight is still tried after it (0035). An update goes back to its
// previous sent time, so the next run finds the same new passengers (0036).
async function releaseDaily(email: DailyEmail) {
  const query = `id=eq.${email.driver_id}&daily_email_sent_for=eq.${email.ride_date}`;
  const response = await rest(`profiles?${query}`, {
    method: "PATCH",
    body: JSON.stringify(email.since ? { daily_email_sent_at: email.since } : { daily_email_retry_for: email.ride_date }),
  });
  if (!response.ok) console.error("daily-passenger-email: release failed", email.driver_id, response.status);
}

// A ride email's rows wait again, for the next run (0043).
async function releaseRide(email: RideEmail) {
  const response = await rest(`email_outbox?id=in.(${email.ids.join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ sent_at: null }),
  });
  if (!response.ok) console.error("daily-passenger-email: release failed", email.ids, response.status);
}

const israelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 600));

const sendDaily = () =>
  sendEmails({
    claim: claimDaily,
    send: async (email: DailyEmail) => {
      await sendMail({ to: email.driver_email, ...buildEmail(email, env("SITE_URL"), israelToday()) });
    },
    release: releaseDaily,
    wait,
    label: (email) => email.driver_id,
  });

const sendRides = () =>
  sendEmails({
    claim: () => claimFrom<RideEmail>("claim_ride_emails"),
    send: async (email: RideEmail) => {
      await sendMail({ to: email.to_email, ...buildRideEmail(email, env("SITE_URL")) });
    },
    release: releaseRide,
    wait,
    label: (email) => `${email.kind} ${email.ids.join(",")}`,
  });

// Each kind goes out even when the other fails; the answer is 500 if either did.
Deno.serve(async (request) => {
  const secret = env("CRON_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const total = { sent: 0, failed: 0 };
  let ok = true;
  for (const run of [sendDaily, sendRides]) {
    try {
      const result = await run();
      total.sent += result.sent;
      total.failed += result.failed;
    } catch (error) {
      console.error("daily-passenger-email:", error);
      ok = false;
    }
  }
  return ok ? Response.json(total) : new Response("Failed", { status: 500 });
});
