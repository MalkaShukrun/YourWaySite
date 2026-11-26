// The ride-alert email (spec A7, C10): a newly published ride matched one or
// more of a passenger's alerts (claim_alert_emails, 0051_ride_alerts.sql), or
// a seat opened on a full one (reason "seat", claim_seat_alert_emails,
// 0052_seat_alerts.sql).
// Plain TypeScript with no Deno APIs, so the unit tests can run it; index.ts
// connects it to the database and Gmail.

import { escapeHtml, formatDate } from "./email.ts";
import { price } from "./ride-emails.ts";

// The database leaves out a range the alert doesn't set.
type MatchedAlert = {
  id: string;
  origins: string;
  destinations: string;
  start_date?: string;
  end_date?: string;
  from_time?: string;
  until_time?: string;
};

export type AlertEmail = {
  // "seat": a seat opened on a full ride, on ride.dates' one date.
  reason?: "seat";
  alert_ids: string[];
  route_id: string;
  to_name: string;
  to_email: string;
  ride: {
    origin: string;
    destination: string;
    out_time: string;
    price: number;
    driver_name: string;
    dates: string[]; // "YYYY-MM-DD", in order
  };
  alerts: MatchedAlert[];
};

// A recurring route can run on many dates in a long range; the email lists the first ones.
const MAX_DATES = 7;

function datesLine(dates: string[]) {
  const shown = dates.slice(0, MAX_DATES).map(formatDate).join(" · ");
  const more = dates.length - MAX_DATES;
  return `${dates.length === 1 ? "תאריך" : "תאריכים"}: ${shown}${more > 0 ? ` ועוד ${more}` : ""}`;
}

const range = (from: string | undefined, until: string | undefined, show: (v: string) => string = (v) => v) =>
  from && until ? `${show(from)} – ${show(until)}` : from ? `מ־${show(from)}` : until ? `עד ${show(until)}` : "";

// "ירושלים ← בני ברק · יום שני, 2 בנובמבר – יום רביעי, 4 בנובמבר · 07:00 – 09:00"
export function alertTitle(alert: MatchedAlert) {
  return [
    `${alert.origins} ← ${alert.destinations}`,
    range(alert.start_date, alert.end_date, formatDate),
    range(alert.from_time, alert.until_time),
  ]
    .filter(Boolean)
    .join(" · ");
}

// siteUrl is the site's public address, for the links; optional.
export function buildAlertEmail(email: AlertEmail, siteUrl = "") {
  const { ride, alerts } = email;
  const base = siteUrl.replace(/\/$/, "");
  const url = (path: string) => (base ? `${base}${path}` : "");
  const link = (href: string, label: string) => (href ? `<a href="${escapeHtml(href)}">${label}</a>` : label);

  const seat = email.reason === "seat";
  const hello = `שלום${email.to_name ? ` ${email.to_name}` : ""},`;
  const happened = seat ? "התפנה מקום בנסיעה" : "פורסמה נסיעה חדשה";
  const intro = alerts.length === 1
    ? `${happened} שמתאימה להתראה שלך:`
    : `${happened} שמתאימה ל־${alerts.length} מההתראות שלך:`;
  const title = `${ride.origin} ← ${ride.destination}`;
  const lines = [datesLine(ride.dates), `שעת יציאה: ${ride.out_time}`, `מחיר: ${price(ride.price)}`, `הנהגת: ${ride.driver_name}`];
  const seatNote = seat
    ? "המקום פנוי למי שנרשמת ראשונה — כדאי למהר."
    : "כדאי לבדוק שעדיין יש מקום פנוי — ייתכן שהנסיעה התמלאה בינתיים.";
  const rideUrl = url(`/ride/${email.route_id}?date=${ride.dates[0]}`);
  const alertsHeading = alerts.length === 1 ? "ההתראה שהופעלה:" : "ההתראות שהופעלו:";
  const removeUrl = (alert: MatchedAlert) => url(`/alerts?alert=${alert.id}`);
  const myAlertsUrl = url("/alerts");
  const settingsUrl = url("/alerts");
  const settings = "אפשר להפסיק את המיילים האלה בעמוד ההתראות";

  return {
    subject: `${seat ? "התפנה מקום בנסיעה" : "נמצאה נסיעה מתאימה"}: ${title}`,
    text: [
      hello,
      intro,
      [title, ...lines].join("\n"),
      seatNote,
      ...(rideUrl ? [`לפרטי הנסיעה ולהרשמה: ${rideUrl}`] : []),
      [alertsHeading, ...alerts.map((a) => `${alertTitle(a)}${removeUrl(a) ? `\nהסרת ההתראה: ${removeUrl(a)}` : ""}`)].join("\n"),
      ...(myAlertsUrl ? [`ההתראות שלי: ${myAlertsUrl}`] : []),
      settingsUrl ? `${settings}: ${settingsUrl}` : `${settings}.`,
    ].join("\n\n"),
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#22302a;text-align:right;">
<p>${escapeHtml(hello)}</p>
<p>${intro}</p>
<h3 style="margin:20px 0 6px;">${escapeHtml(title)}</h3>
${lines.map((line) => `<p style="margin:2px 0;">${escapeHtml(line)}</p>`).join("\n")}
<p style="margin-top:12px;"><strong>${seatNote}</strong></p>
${rideUrl ? `<p>${link(rideUrl, "לפרטי הנסיעה ולהרשמה")}</p>` : ""}
<p style="margin:20px 0 6px;">${alertsHeading}</p>
${alerts
  .map((a) => `<p style="margin:2px 0;">${escapeHtml(alertTitle(a))}${removeUrl(a) ? ` · ${link(removeUrl(a), "הסרת ההתראה")}` : ""}</p>`)
  .join("\n")}
${myAlertsUrl ? `<p style="margin-top:24px;">${link(myAlertsUrl, "ההתראות שלי")}</p>` : ""}
<p style="color:#59665f;font-size:13px;">${link(settingsUrl, settings)}.</p>
</div>`,
  };
}
