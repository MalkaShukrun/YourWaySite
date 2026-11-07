// Emails about a member's own rides (spec A7), from claim_ride_emails
// (0043_ride_emails.sql). Plain TypeScript with no Deno APIs, so the unit tests
// can run it; index.ts connects it to the database and Gmail.

import { escapeHtml, formatDate } from "./email.ts";

type RideEmailKind = "booked" | "cancelled" | "passenger_cancelled" | "ride_cancelled";

// The database leaves out what this kind of email doesn't carry.
type EmailRide = {
  ride_date: string; // "YYYY-MM-DD"
  out_time: string;
  origin: string;
  destination: string;
  pickup: string;
  dropoff: string;
  price?: number;
  driver_name?: string;
  driver_phone?: string;
  passenger_name?: string; // Only to the driver, when a passenger cancels.
};

export type RideEmail = {
  ids: number[];
  kind: RideEmailKind;
  to_name: string;
  to_email: string;
  rides: EmailRide[];
};

type Copy = {
  subject: (rides: EmailRide[]) => string;
  intro: (rides: EmailRide[]) => string;
  page: "my-rides" | "dashboard";
};

const firstRide = (rides: EmailRide[]) => `${formatDate(rides[0].ride_date)}, ${rides[0].out_time}`;

const COPY: Record<RideEmailKind, Copy> = {
  booked: {
    subject: (r) => (r.length === 1 ? `נרשמת לנסיעה: ${firstRide(r)}` : `נרשמת ל־${r.length} נסיעות`),
    intro: (r) => (r.length === 1 ? "ההרשמה שלך לנסיעה נקלטה:" : `ההרשמה שלך ל־${r.length} נסיעות נקלטה:`),
    page: "my-rides",
  },
  cancelled: {
    subject: (r) => (r.length === 1 ? `ההרשמה בוטלה: ${firstRide(r)}` : `ההרשמה ל־${r.length} נסיעות בוטלה`),
    intro: (r) =>
      r.length === 1 ? "ביטלת את ההרשמה לנסיעה, והמקום התפנה:" : "ביטלת את ההרשמה לנסיעות האלה, והמקומות התפנו:",
    page: "my-rides",
  },
  ride_cancelled: {
    subject: (r) =>
      r.length === 1 ? `הנהגת ביטלה את הנסיעה: ${firstRide(r)}` : `הנהגת ביטלה ${r.length} נסיעות שנרשמת אליהן`,
    intro: (r) =>
      r.length === 1
        ? "הנהגת ביטלה את הנסיעה שנרשמת אליה, ולא תחויבי עליה:"
        : "הנהגת ביטלה את הנסיעות האלה שנרשמת אליהן, ולא תחויבי עליהן:",
    page: "my-rides",
  },
  passenger_cancelled: {
    subject: (r) => (r.length === 1 ? `נוסעת ביטלה הרשמה: ${firstRide(r)}` : `${r.length} ביטולי הרשמה לנסיעות שלך`),
    intro: (r) =>
      r.length === 1
        ? "נוסעת ביטלה את ההרשמה לנסיעה שלך, והמקום התפנה:"
        : "נוסעות ביטלו את ההרשמה לנסיעות שלך, והמקומות התפנו:",
    page: "dashboard",
  },
};

const PAGE_LABEL = { "my-rides": "הנסיעות שלי", dashboard: "לוח נהגת שבועי" };

const rideTitle = (ride: EmailRide) =>
  `${formatDate(ride.ride_date)}, ${ride.out_time} · ${ride.origin} ← ${ride.destination}`;

// As formatPrice in lib/utils/format.ts, which the function can't import.
const price = (value: number) => `₪${Number(value).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;

// The lines under a ride's title.
function rideLines(ride: EmailRide) {
  if (ride.passenger_name !== undefined) return [`הנוסעת: ${ride.passenger_name} · תחנת עלייה: ${ride.pickup}`];
  const lines = [`איסוף: ${ride.pickup} · הורדה: ${ride.dropoff}`];
  if (ride.price !== undefined) lines.push(`מחיר: ${price(ride.price)}`);
  if (ride.driver_name !== undefined) {
    lines.push(`הנהגת: ${ride.driver_name}${ride.driver_phone ? ` · טלפון: ${ride.driver_phone}` : ""}`);
  }
  return lines;
}

// siteUrl is the site's public address, for the links; optional.
export function buildRideEmail(email: RideEmail, siteUrl = "") {
  const copy = COPY[email.kind];
  const hello = `שלום${email.to_name ? ` ${email.to_name}` : ""},`;
  const intro = copy.intro(email.rides);
  const base = siteUrl.replace(/\/$/, "");
  const pagePath = copy.page === "dashboard" ? `/dashboard?date=${email.rides[0].ride_date}` : "/my-rides";
  const pageUrl = base ? `${base}${pagePath}` : "";
  const profileUrl = base ? `${base}/profile` : "";
  const settings = "אפשר להפסיק את המיילים האלה בעמוד הפרופיל";
  const link = (url: string, label: string) => (url ? `<a href="${escapeHtml(url)}">${label}</a>` : label);

  return {
    subject: copy.subject(email.rides),
    text: [
      hello,
      intro,
      ...email.rides.map((ride) => [rideTitle(ride), ...rideLines(ride)].join("\n")),
      ...(pageUrl ? [`${PAGE_LABEL[copy.page]}: ${pageUrl}`] : []),
      profileUrl ? `${settings}: ${profileUrl}` : `${settings}.`,
    ].join("\n\n"),
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#22302a;text-align:right;">
<p>${escapeHtml(hello)}</p>
<p>${intro}</p>
${email.rides
  .map(
    (ride) => `<h3 style="margin:20px 0 6px;">${escapeHtml(rideTitle(ride))}</h3>
${rideLines(ride).map((line) => `<p style="margin:2px 0;">${escapeHtml(line)}</p>`).join("\n")}`,
  )
  .join("\n")}
${pageUrl ? `<p style="margin-top:24px;">${link(pageUrl, PAGE_LABEL[copy.page])}</p>` : ""}
<p style="color:#59665f;font-size:13px;">${link(profileUrl, settings)}.</p>
</div>`,
  };
}
