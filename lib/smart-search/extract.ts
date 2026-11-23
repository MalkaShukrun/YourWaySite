// Smart search: reads a free Hebrew sentence ("בית שמש לירושלים מחר בבוקר")
// and pulls out the search's filters — where from, where to, a date, a
// departure-time range and the ride type. Plain rules over the site's own
// place list: no AI, no network, runs in the browser. Safe to import from
// Client Components.
import { addDays, format, getDay, parseISO } from "date-fns";
import type { RideGroup, RideKind } from "@/lib/rides/types";
import { cityPick } from "@/lib/rides/search";
import { splitPlace } from "@/lib/utils/format";
import { clockOf } from "@/lib/utils/dates";

type Role = "origin" | "destination";

// One way to read a place the user named, for "התכוונת ל…?".
export type PlaceChoice = { label: string; pick: string };

export type ExtractedSearch = {
  origins?: string[];
  destinations?: string[];
  date?: string;
  from?: string;
  to?: string;
  kind?: RideKind;
  // A place name that fits several places (a neighborhood in two cities): all
  // are searched, and she can pick one.
  ambiguous: { role: Role; choices: PlaceChoice[] }[];
};

// ─── Words ───────────────────────────────────────────────────────────────────

// A word's entry in one of the tables below. Only the table's own words:
// "constructor" is on every object too, and isn't a weekday.
function lookup<T>(table: Record<string, T>, word: string): T | undefined {
  return Object.hasOwn(table, word) ? table[word] : undefined;
}

// Spelling that shouldn't stop a match: quotes and gershayim ("רמה ג׳" is
// "רמה ג"), punctuation, dashes and maqaf ("מ-בית שמש"), extra spaces, case.
// Colons stay, for times ("8:00").
function words(text: string) {
  return text
    .replace(/['"`׳״]/g, "")
    .replace(/[-־–—,.?!;()]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

// Hebrew joins little words to the next one: "מבית שמש", "לירושלים",
// "ומרמה ג". A word as written, then without one or two of these letters in
// front — as written first, so "מודיעין" stays itself.
const PREFIXES = "ובלמהשכ";

function readings(word: string): { word: string; prefix: string }[] {
  const out = [{ word, prefix: "" }];
  for (let n = 1; n <= 2; n++) {
    const prefix = word.slice(0, n);
    const rest = word.slice(n);
    if (rest.length >= 2 && [...prefix].every((c) => PREFIXES.includes(c))) out.push({ word: rest, prefix });
  }
  return out;
}

// "מ" in front means from, "ל" means to; the first of them in the prefix counts.
function roleOfPrefix(prefix: string): Role | null {
  for (const c of prefix) {
    if (c === "מ") return "origin";
    if (c === "ל") return "destination";
  }
  return null;
}

// Direction words on their own, before the place: "מ - בית שמש", "לכיוון ירושלים".
const DIRECTION_WORDS: Record<string, Role> = { מ: "origin", מכיוון: "origin", ל: "destination", לכיוון: "destination" };

// ─── Places ──────────────────────────────────────────────────────────────────

type Candidate = { words: string[]; picks: string[]; choices: PlaceChoice[]; rank: number };

// Every way to name a place: "בית שמש רמה ג" (that place), "רמה ג" (every
// place with that neighborhood), "בית שמש" (the whole city). Longer names
// first; on a tie, a neighborhood before a whole city.
function candidates(groups: RideGroup[]): Candidate[] {
  const places = new Map<string, { city: string; name: string }>();
  for (const g of groups) {
    places.set(g.origin_place_id, { city: g.origin_city, name: g.origin });
    places.set(g.destination_place_id, { city: g.destination_city, name: g.destination });
  }

  const list: Candidate[] = [];
  const byNeighborhood = new Map<string, { id: string; name: string }[]>();
  const cities = new Set<string>();
  for (const [id, { city, name }] of places) {
    cities.add(city);
    const { neighborhood } = splitPlace(name);
    if (!neighborhood) continue;
    list.push({ words: words(`${city} ${neighborhood}`), picks: [id], choices: [], rank: 0 });
    const key = words(neighborhood).join(" ");
    byNeighborhood.set(key, [...(byNeighborhood.get(key) ?? []), { id, name }]);
  }
  for (const [key, matches] of byNeighborhood) {
    const choices = matches.length > 1 ? matches.map((m) => ({ label: m.name, pick: m.id })) : [];
    list.push({ words: key.split(" "), picks: matches.map((m) => m.id), choices, rank: 1 });
  }
  for (const city of cities) list.push({ words: words(city), picks: [cityPick(city)], choices: [], rank: 2 });

  return list.sort((a, b) => b.words.length - a.words.length || a.rank - b.rank);
}

type FoundPlace = { start: number; end: number; role: Role | null; picks: string[]; choices: PlaceChoice[] };

function findPlaces(tokens: string[], groups: RideGroup[]): FoundPlace[] {
  const all = candidates(groups);
  const found: FoundPlace[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const match = matchAt(tokens, i, all);
    if (!match) continue;
    const role = roleOfPrefix(match.prefix) ?? (i > 0 ? (lookup(DIRECTION_WORDS, tokens[i - 1]) ?? null) : null);
    found.push({ start: i, end: i + match.candidate.words.length, role, picks: match.candidate.picks, choices: match.candidate.choices });
    i += match.candidate.words.length - 1;
  }
  return found;
}

function matchAt(tokens: string[], i: number, all: Candidate[]) {
  for (const { word, prefix } of readings(tokens[i])) {
    for (const candidate of all) {
      const [first, ...rest] = candidate.words;
      if (first === word && rest.every((w, k) => tokens[i + 1 + k] === w)) return { candidate, prefix };
    }
  }
  return null;
}

// From and to: a place marked by "מ" / "ל" takes that end; the others fill
// the ends still open, in order — so a single unmarked place is where from,
// and "בית שמש ירושלים" goes from the first to the second.
function assignRoles(found: FoundPlace[]) {
  const ends: Partial<Record<Role, FoundPlace>> = {};
  for (const place of found) if (place.role && !ends[place.role]) ends[place.role] = place;
  for (const place of found) {
    if (place === ends.origin || place === ends.destination) continue;
    if (!ends.origin) ends.origin = place;
    else if (!ends.destination) ends.destination = place;
  }
  return ends;
}

// ─── Date ────────────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  ראשון: 0, א: 0, שני: 1, ב: 1, שלישי: 2, ג: 2, רביעי: 3, ד: 3, חמישי: 4, ה: 4, שישי: 5, ו: 5, שבת: 6,
};

// היום, מחר, מחרתיים, "יום שלישי" / "ביום ג", שבת. A weekday is the next one
// to come (today's weekday means next week). null = no day named.
function findDate(tokens: string[], today: string): string | null {
  const day = (n: number) => format(addDays(parseISO(today), n), "yyyy-MM-dd");
  const weekday = (target: number) => day((target - getDay(parseISO(today)) + 7) % 7 || 7);
  for (let i = 0; i < tokens.length; i++) {
    const named = lookup(WEEKDAYS, tokens[i + 1] ?? "");
    for (const { word } of readings(tokens[i])) {
      if (word === "היום") return day(0);
      if (word === "מחר") return day(1);
      if (word === "מחרתיים" || word === "מחרתים") return day(2);
      if (word === "שבת") return weekday(6);
      if (word === "יום" && named !== undefined) return weekday(named);
    }
  }
  return null;
}

// ─── Time ────────────────────────────────────────────────────────────────────

// A part of the day. "אחר הצהריים" (or אחה״צ) is two words, read on its own.
type Period = "בוקר" | "צהריים" | "אחר הצהריים" | "ערב" | "לילה";

const PERIODS: Record<Period, [string, string]> = {
  בוקר: ["06:00", "11:00"],
  צהריים: ["11:00", "14:00"],
  "אחר הצהריים": ["14:00", "17:00"],
  ערב: ["17:00", "21:00"],
  לילה: ["20:00", "23:59"],
};

const PERIOD_WORDS: Record<string, Period> = { בוקר: "בוקר", צהריים: "צהריים", צהרים: "צהריים", ערב: "ערב", לילה: "לילה" };
const NOON = new Set(["הצהריים", "הצהרים", "צהריים", "צהרים"]);

function findPeriod(tokens: string[]): Period | null {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "אחהצ" || ((tokens[i] === "אחר" || tokens[i] === "אחרי") && NOON.has(tokens[i + 1] ?? ""))) return "אחר הצהריים";
  }
  for (const token of tokens) {
    for (const { word } of readings(token)) {
      const period = lookup(PERIOD_WORDS, word);
      if (period) return period;
    }
  }
  return null;
}

const HOUR_WORDS: Record<string, number> = {
  אחת: 1, שתיים: 2, שתים: 2, שלוש: 3, ארבע: 4, חמש: 5, שש: 6, שבע: 7, שמונה: 8, תשע: 9, עשר: 10,
};

// An hour as she wrote it, without a ב in front: "8", "8:30", "שמונה",
// "אחת עשרה" (two words). null = not an hour.
function hourAt(tokens: string[], i: number): { hour: number; minute: number; words: number } | null {
  const word = tokens[i] ?? "";
  const clock = /^(\d{1,2})(?::(\d{2}))?$/.exec(word);
  if (clock) return { hour: Number(clock[1]), minute: Number(clock[2] ?? 0), words: 1 };
  const hour = lookup(HOUR_WORDS, word);
  if (hour !== undefined) {
    const teen = tokens[i + 1] === "עשרה";
    return { hour: hour + (teen ? 10 : 0), minute: 0, words: teen ? 2 : 1 };
  }
  return null;
}

// The hour on the clock, in minutes from midnight. Hours 1–5 are afternoon
// unless she says בוקר; an hour said with ערב, לילה or אחר הצהריים is after
// noon, and so is one before 11 said with צהריים. null = no such time.
function minutesOf({ hour, minute }: { hour: number; minute: number }, period: Period | null) {
  if (hour > 23 || minute > 59) return null;
  const afternoon =
    period === "ערב" || period === "לילה" || period === "אחר הצהריים" || (period === "צהריים" && hour < 11) || (!period && hour <= 5);
  if (hour < 12 && afternoon) hour += 12;
  return hour * 60 + minute;
}

// "אחרי 4" / "מ-4" (from then), "עד 9" / "לפני 9" (up to then), "בין 8 ל-10",
// with "השעה" or "שעה" allowed between: "עד השעה 8:30". Returns the bounds
// and the words used. "מ" and "ל" count only before an hour; before a place
// they say where from and where to.
const AFTER = new Set(["אחרי", "החל", "מ", "משעה", "מהשעה", "בין"]);
const UNTIL = new Set(["עד", "לפני", "ל"]);

function findBounds(tokens: string[], period: Period | null) {
  const bounds: { from?: string; to?: string } = {};
  const used = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const side = readings(tokens[i]).some(({ word }) => AFTER.has(word))
      ? "from"
      : readings(tokens[i]).some(({ word }) => UNTIL.has(word))
        ? "to"
        : null;
    if (!side || bounds[side]) continue;
    let j = i + 1;
    if (tokens[j] === "מ" || tokens[j] === "מהשעה") j++; // "החל מ-8", "החל מהשעה 8"
    if (tokens[j] === "השעה" || tokens[j] === "שעה") j++;
    const at = hourAt(tokens, j);
    const minutes = at && minutesOf(at, period);
    if (minutes === null || minutes === undefined) continue;
    bounds[side] = clockOf(minutes);
    for (let k = i; k < j + at!.words; k++) used.add(k);
  }
  return { bounds, used };
}

// "בשמונה", "ב-8", "8:00", "בשעה 7:30": about then, half an hour each way.
function findClock(tokens: string[], period: Period | null): [string, string] | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // "ב 8" is split by the dash in "ב-8"; "בשעה 8" names it too.
    const at =
      token === "ב" || token === "בשעה"
        ? hourAt(tokens, i + 1)
        : token.startsWith("ב")
          ? hourAt([token.slice(1), tokens[i + 1] ?? ""], 0)
          : token.includes(":")
            ? hourAt(tokens, i)
            : null;
    const minutes = at && minutesOf(at, period);
    if (minutes === null || minutes === undefined) continue;
    return [clockOf(Math.max(0, minutes - 30)), clockOf(Math.min(23 * 60 + 59, minutes + 30))];
  }
  return null;
}

// The departure range: an hour she names or the part of the day, narrowed by
// "אחרי" / "עד" — "בבוקר עד 9" is 06:00–09:00, "אחרי 4" is from 16:00 on.
function findTimes(tokens: string[]): { from?: string; to?: string } {
  const period = findPeriod(tokens);
  const { bounds, used } = findBounds(tokens, period);
  const base = findClock(tokens.filter((_, i) => !used.has(i)), period) ?? (period ? PERIODS[period] : null);
  let from = bounds.from ?? base?.[0];
  let to = bounds.to ?? base?.[1];
  if (from && to && from > to) [from, to] = [to, from];
  return { ...(from && { from }), ...(to && { to }) };
}

// ─── Ride type ───────────────────────────────────────────────────────────────

// קבועה (every week) or חד־פעמית (once). The dash in "חד־פעמית" splits it in two.
function findKind(tokens: string[]): RideKind | null {
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1] ?? "";
    for (const { word } of readings(tokens[i])) {
      if (word === "קבועה" || word === "קבוע" || word === "קבועות") return "recurring";
      if (word === "כל" && (next === "יום" || next === "שבוע")) return "recurring";
      if (word === "חדפעמית" || word === "חדפעמי" || (word === "חד" && next.startsWith("פעמי"))) return "one_time";
      if (word === "פעם" && next === "אחת") return "one_time";
    }
  }
  return null;
}

// ─── All together ────────────────────────────────────────────────────────────

// The filters a sentence names, or null when it names none (fewer than two
// letters, or only words it doesn't know — those are skipped quietly).
export function extractSearch(text: string, groups: RideGroup[], today: string): ExtractedSearch | null {
  if (text.trim().length < 2) return null;
  const tokens = words(text);

  const found = findPlaces(tokens, groups);
  const ends = assignRoles(found);
  // Words inside place names don't count as days, times or ride types.
  const rest = tokens.filter((_, i) => !found.some((p) => i >= p.start && i < p.end));
  const date = findDate(rest, today);
  const times = findTimes(rest);
  const kind = findKind(rest);

  const result: ExtractedSearch = {
    ...(ends.origin && { origins: ends.origin.picks }),
    ...(ends.destination && { destinations: ends.destination.picks }),
    ...(date && { date }),
    ...times,
    ...(kind && { kind }),
    ambiguous: (["origin", "destination"] as const)
      .filter((role) => ends[role]?.choices.length)
      .map((role) => ({ role, choices: ends[role]!.choices })),
  };
  const named = result.origins || result.destinations || result.date || result.from || result.to || result.kind;
  return named ? result : null;
}
