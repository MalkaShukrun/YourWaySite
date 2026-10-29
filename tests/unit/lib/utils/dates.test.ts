import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatMonth,
  formatRideDate,
  formatShortRideDate,
  formatTime,
  formatWeekRange,
  greetingFor,
  isIsoDate,
  israelHour,
  israelNow,
  israelToday,
  recentMonths,
  rideWeekOf,
  weekdaysOf,
} from "@/lib/utils/dates";

// All times are Israel time (spec §2 "Rides and dates"), whatever the server's clock zone.
describe("Israel clock", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    // Winter (UTC+2): 22:30 UTC is already the next day in Israel.
    ["2026-10-29T22:30:00Z", "2026-10-30", 0],
    // Summer (UTC+3).
    ["2026-06-15T21:30:00Z", "2026-06-16", 0],
    ["2026-06-15T05:00:00Z", "2026-06-15", 8],
    // The last moment of the year in UTC is New Year's morning in Israel.
    ["2026-12-31T23:59:00Z", "2027-01-01", 1],
  ])("at %s UTC it is %s, hour %i, in Israel", async (utc, day, hour) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(utc));
    expect(await israelToday()).toBe(day);
    expect(await israelHour()).toBe(hour);
    expect((await israelNow()).getTime()).toBe(Date.parse(utc));
  });
});

describe("greetingFor", () => {
  it.each([
    [0, "בוקר טוב"],
    [11, "בוקר טוב"],
    [12, "צהריים טובים"],
    [16, "צהריים טובים"],
    [17, "ערב טוב"],
    [23, "ערב טוב"],
  ])("hour %i → %s", (hour, greeting) => {
    expect(greetingFor(hour)).toBe(greeting);
  });
});

describe("ride date labels", () => {
  it("writes the long date with its Hebrew weekday", () => {
    expect(formatRideDate("2025-06-22")).toBe("יום א׳, 22 ביוני");
    expect(formatRideDate("2026-10-31")).toBe("יום ש׳, 31 באוקטובר");
  });

  it("writes the short date for chips", () => {
    expect(formatShortRideDate("2025-06-22")).toBe("א׳ 22.6");
    expect(formatShortRideDate("2026-01-09")).toBe("ו׳ 9.1");
  });

  it("lists the distinct weekdays of some dates, Sunday first", () => {
    expect(weekdaysOf(["2025-06-24", "2025-06-22"])).toBe("א׳ · ג׳");
    expect(weekdaysOf(["2025-06-22", "2025-06-29"])).toBe("א׳"); // two Sundays
    expect(weekdaysOf([])).toBe("");
  });

  it("cuts seconds off a database time", () => {
    expect(formatTime("07:15:00")).toBe("07:15");
    expect(formatTime("23:59")).toBe("23:59");
    expect(formatTime(null)).toBe("");
  });
});

// The driver dashboard's week runs Sunday to Saturday (spec D1).
describe("rideWeekOf", () => {
  it("returns Sunday to Saturday around a midweek date", () => {
    expect(rideWeekOf("2025-06-24")).toEqual([
      "2025-06-22", "2025-06-23", "2025-06-24", "2025-06-25", "2025-06-26", "2025-06-27", "2025-06-28",
    ]);
  });

  it("starts on the date itself when it's a Sunday, and ends on it when it's a Saturday", () => {
    expect(rideWeekOf("2025-06-22")[0]).toBe("2025-06-22");
    expect(rideWeekOf("2025-06-28")[6]).toBe("2025-06-28");
  });

  it("crosses month and year boundaries", () => {
    expect(rideWeekOf("2026-01-01")).toEqual([
      "2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03",
    ]);
  });

  it("formats the week's range", () => {
    expect(formatWeekRange(rideWeekOf("2026-01-01"))).toBe("28.12 – 3.1");
  });
});

describe("isIsoDate", () => {
  it.each(["2026-11-01", "2024-02-29"])("accepts %s", (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each([
    ["a non-date", "tomorrow"],
    ["the wrong format", "1.11.2026"],
    ["a month that doesn't exist", "2026-13-01"],
    ["an empty string", ""],
    ["a number", 20261101],
    ["an array (repeated query param)", ["2026-11-01"]],
    ["undefined", undefined],
  ])("rejects %s", (_name, value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

// The payments month picker: this month and the 3 before (spec G2).
describe("recentMonths", () => {
  it("lists this month and the three before, newest first", () => {
    expect(recentMonths("2026-10-29")).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
  });

  it("crosses the year boundary", () => {
    expect(recentMonths("2026-02-15")).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("never lists a future month, and takes another count", () => {
    expect(recentMonths("2026-01-31", 1)).toEqual(["2026-01", "2025-12"]);
    expect(recentMonths("2026-01-31", 0)).toEqual(["2026-01"]);
  });

  it("names a month in Hebrew", () => {
    expect(formatMonth("2025-06")).toBe("יוני 2025");
    expect(formatMonth("2026-12")).toBe("דצמבר 2026");
  });
});
