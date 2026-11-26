// The daily email to the driver: who rides with her tomorrow, and the update
// when a passenger books or cancels after it. Plain TypeScript with no Deno
// APIs, so the unit tests can run it; index.ts connects it to the database and Gmail.

// is_new and is_cancelled come only on an update; a cancelled passenger has
// no phone or email (0047).
type DailyPassenger = {
  name: string;
  phone: string | null;
  email: string | null;
  pickup: string;
  is_new?: boolean;
  is_cancelled?: boolean;
};
type DailyRide = { origin: string; destination: string; out_time: string; passengers: DailyPassenger[] };
export type DailyEmail = {
  driver_id: string;
  driver_name: string;
  driver_email: string;
  ride_date: string; // "YYYY-MM-DD"
  rides: DailyRide[];
  since?: string; // Only on an update: when her previous email was sent.
};

// "2026-11-02" → "יום שני, 2 בנובמבר"
export function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

// Names and stops are what users typed.
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const rideTitle = (ride: DailyRide) => `${ride.out_time} · ${ride.origin} ← ${ride.destination}`;

const cell = "padding:8px;border-bottom:1px solid #e3e8e5;text-align:right;";

const NEW_MARK = "חדשה";
const CANCELLED_MARK = "ביטלה";

// A ride whose last passenger cancelled shows only her, with this under it.
const EMPTY_RIDE = "אין כרגע נוסעות בנסיעה הזו.";

const isEmpty = (ride: DailyRide) => ride.passengers.every((p) => p.is_cancelled);

function passengerRow(p: DailyPassenger) {
  const values = [p.name, p.phone ?? "—", p.email ?? "—", p.pickup];
  const cells = values.map((v) => `<td style="${cell}">${escapeHtml(v)}</td>`);
  if (p.is_new) cells[0] = `<td style="${cell}"><strong>${escapeHtml(p.name)}</strong> (${NEW_MARK})</td>`;
  if (p.is_cancelled) cells[0] = `<td style="${cell}"><s>${escapeHtml(p.name)}</s> (${CANCELLED_MARK})</td>`;
  const background = p.is_new ? "#eef7e4" : p.is_cancelled ? "#fbeaea" : "";
  return `<tr${background ? ` style="background:${background};"` : ""}>${cells.join("")}</tr>`;
}

function rideHtml(ride: DailyRide) {
  const headers = ["שם", "טלפון", "דוא״ל", "תחנת איסוף"];
  return `<h3 style="margin:20px 0 8px;">${escapeHtml(rideTitle(ride))}</h3>
<table dir="rtl" style="border-collapse:collapse;width:100%;">
<tr>${headers.map((h) => `<th style="${cell}">${h}</th>`).join("")}</tr>
${ride.passengers.map(passengerRow).join("\n")}
</table>${isEmpty(ride) ? `\n<p style="margin:6px 0;">${EMPTY_RIDE}</p>` : ""}`;
}

const mark = (p: DailyPassenger) => (p.is_new ? ` (${NEW_MARK})` : p.is_cancelled ? ` (${CANCELLED_MARK})` : "");

function rideText(ride: DailyRide) {
  const rows = ride.passengers.map(
    (p) => `- ${p.name}${mark(p)} | טלפון: ${p.phone ?? "—"} | דוא״ל: ${p.email ?? "—"} | תחנת איסוף: ${p.pickup}`,
  );
  return [rideTitle(ride), ...rows, ...(isEmpty(ride) ? [EMPTY_RIDE] : [])].join("\n");
}

// What an update says changed: passengers who joined, who cancelled, or both.
function updateIntro(rides: DailyRide[], date: string) {
  const passengers = rides.flatMap((r) => r.passengers);
  const joined = passengers.some((p) => p.is_new);
  const cancelled = passengers.some((p) => p.is_cancelled);
  if (joined && cancelled) {
    return `היו שינויים בנסיעות שלך ב${date}. זו הרשימה המעודכנת, ומסומנות בה הנוסעות החדשות והנוסעות שביטלו:`;
  }
  if (cancelled) return `נוסעות ביטלו את ההרשמה לנסיעות שלך ב${date}. זו הרשימה המעודכנת, והנוסעות שביטלו מסומנות:`;
  return `נוספו נוסעות לנסיעות שלך ב${date}. זו הרשימה המעודכנת, והנוסעות החדשות מסומנות:`;
}

// siteUrl is the site's public address, for the link to the profile; optional.
// today ("YYYY-MM-DD", Israel time) is set when the email goes out on the ride
// day itself: a retry after midnight, or an update.
export function buildEmail(email: DailyEmail, siteUrl = "", today = "") {
  const date = formatDate(email.ride_date);
  const when = email.ride_date === today ? "להיום" : "למחר";
  const update = Boolean(email.since);
  const intro = update ? updateIntro(email.rides, date) : `אלו הנוסעות הרשומות לנסיעות שלך ב${date}:`;
  const updatedNote = "המצב המעודכן תמיד זמין בלוח הנהגת באתר.";
  const settingsUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/alerts` : "";
  const settings = "אפשר לשנות את השעה או להפסיק את המיילים בעמוד ההתראות";
  return {
    subject: `${update ? "עדכון: " : ""}הנוסעות שלך ${when}, ${date}`,
    text: [
      `שלום ${email.driver_name},`,
      intro,
      ...email.rides.map(rideText),
      updatedNote,
      settingsUrl ? `${settings}: ${settingsUrl}` : `${settings}.`,
    ].join("\n\n"),
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#22302a;text-align:right;">
<p>שלום ${escapeHtml(email.driver_name)},</p>
<p>${intro}</p>
${email.rides.map(rideHtml).join("\n")}
<p style="margin-top:24px;">${updatedNote}</p>
<p style="color:#59665f;font-size:13px;">${settingsUrl ? `<a href="${escapeHtml(settingsUrl)}">${settings}</a>` : settings}.</p>
</div>`,
  };
}
