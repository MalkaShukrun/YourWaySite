// The daily email to the driver: who rides with her tomorrow. Plain TypeScript
// with no Deno APIs, so the unit tests can run it; index.ts connects it to the
// database and Gmail.

type DailyPassenger = { name: string; phone: string | null; email: string | null; pickup: string };
type DailyRide = { origin: string; destination: string; out_time: string; passengers: DailyPassenger[] };
export type DailyEmail = {
  driver_id: string;
  driver_name: string;
  driver_email: string;
  ride_date: string; // "YYYY-MM-DD"
  rides: DailyRide[];
};

type Deps = {
  claim: () => Promise<DailyEmail[]>;
  send: (email: DailyEmail) => Promise<void>;
  release: (email: DailyEmail) => Promise<void>;
  wait: () => Promise<void>;
};

// Sends every claimed email, one at a time so Gmail doesn't see a burst.
// A failed send is released, so the next run tries that driver again, for the same date.
export async function sendDailyEmails({ claim, send, release, wait }: Deps) {
  const emails = await claim();
  let sent = 0;
  for (const [index, email] of emails.entries()) {
    if (index > 0) await wait();
    try {
      await send(email);
      sent += 1;
    } catch (error) {
      console.error("daily-passenger-email: send failed", email.driver_id, error);
      await release(email);
    }
  }
  return { sent, failed: emails.length - sent };
}

// "2026-11-02" → "יום שני, 2 בנובמבר"
function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

// Names and stops are what users typed.
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const rideTitle = (ride: DailyRide) => `${ride.out_time} · ${ride.origin} ← ${ride.destination}`;

const cell = "padding:8px;border-bottom:1px solid #e3e8e5;text-align:right;";

function passengerRow(p: DailyPassenger) {
  const values = [p.name, p.phone ?? "—", p.email ?? "—", p.pickup];
  return `<tr>${values.map((v) => `<td style="${cell}">${escapeHtml(v)}</td>`).join("")}</tr>`;
}

function rideHtml(ride: DailyRide) {
  const headers = ["שם", "טלפון", "דוא״ל", "תחנת עלייה"];
  return `<h3 style="margin:20px 0 8px;">${escapeHtml(rideTitle(ride))}</h3>
<table dir="rtl" style="border-collapse:collapse;width:100%;">
<tr>${headers.map((h) => `<th style="${cell}">${h}</th>`).join("")}</tr>
${ride.passengers.map(passengerRow).join("\n")}
</table>`;
}

function rideText(ride: DailyRide) {
  const rows = ride.passengers.map(
    (p) => `- ${p.name} | טלפון: ${p.phone ?? "—"} | דוא״ל: ${p.email ?? "—"} | תחנת עלייה: ${p.pickup}`,
  );
  return [rideTitle(ride), ...rows].join("\n");
}

// siteUrl is the site's public address, for the link to the profile; optional.
// today ("YYYY-MM-DD", Israel time) is set when a retry after midnight sends
// the email on the ride day itself.
export function buildEmail(email: DailyEmail, siteUrl = "", today = "") {
  const date = formatDate(email.ride_date);
  const when = email.ride_date === today ? "להיום" : "למחר";
  const updatedNote = "הרשימה נכונה לרגע השליחה. ברשימת הנוסעות באתר תמיד מופיע המצב העדכני.";
  const profileUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/profile` : "";
  const settings = "אפשר לשנות את השעה או להפסיק את המיילים בעמוד הפרופיל";
  return {
    subject: `הנוסעות שלך ${when}, ${date}`,
    text: [
      `שלום ${email.driver_name},`,
      `אלו הנוסעות הרשומות לנסיעות שלך ב${date}:`,
      ...email.rides.map(rideText),
      updatedNote,
      profileUrl ? `${settings}: ${profileUrl}` : `${settings}.`,
    ].join("\n\n"),
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#22302a;text-align:right;">
<p>שלום ${escapeHtml(email.driver_name)},</p>
<p>אלו הנוסעות הרשומות לנסיעות שלך ב${date}:</p>
${email.rides.map(rideHtml).join("\n")}
<p style="margin-top:24px;">${updatedNote}</p>
<p style="color:#59665f;font-size:13px;">${profileUrl ? `<a href="${escapeHtml(profileUrl)}">${settings}</a>` : settings}.</p>
</div>`,
  };
}
