import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMonth, formatRideDate, formatShortRideDate, formatTime, formatWeekRange, greetingFor, isIsoDate, israelHour, israelToday, recentMonths, rideWeekOf, weekdaysOf } from "@/lib/dates";

afterEach(() => vi.useRealTimers());

describe("israelToday / israelHour", () => {
  it("uses Israel's date, not the server's UTC date", async () => {
    vi.useFakeTimers();
    // 22:30 UTC on Nov 1 is already 00:30 on Nov 2 in Israel (UTC+2 in winter).
    vi.setSystemTime(new Date("2026-11-01T22:30:00Z"));
    expect(await israelToday()).toBe("2026-11-02");
    expect(await israelHour()).toBe(0);
  });

  it("follows daylight saving time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T05:00:00Z")); // UTC+3 in summer
    expect(await israelHour()).toBe(8);
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

describe("formatRideDate", () => {
  it("formats with the Hebrew weekday letter and month", () => {
    expect(formatRideDate("2025-06-22")).toBe("יום א׳, 22 ביוני");
    expect(formatRideDate("2026-10-30")).toBe("יום ו׳, 30 באוקטובר");
  });
});

describe("formatShortRideDate", () => {
  it("formats as weekday letter and day.month", () => {
    expect(formatShortRideDate("2026-10-27")).toBe("ג׳ 27.10");
    expect(formatShortRideDate("2026-11-01")).toBe("א׳ 1.11");
  });
});

describe("weekdaysOf", () => {
  it("lists each weekday once, Sunday first", () => {
    expect(weekdaysOf(["2026-10-29", "2026-10-27", "2026-11-01", "2026-11-03"])).toBe("א׳ · ג׳ · ה׳");
  });
});

describe("rideWeekOf", () => {
  const week = ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];

  it.each(["2026-10-25", "2026-10-28", "2026-10-30"])("gives Sunday–Friday of the week that holds %s", (day) => {
    expect(rideWeekOf(day)).toEqual(week);
  });

  it("puts Saturday in the week that just ended", () => {
    expect(rideWeekOf("2026-10-31")).toEqual(week);
  });

  it("crosses month and year boundaries", () => {
    expect(rideWeekOf("2026-12-31")).toEqual(["2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("formatWeekRange", () => {
  it("shows the first and last day as day.month", () => {
    expect(formatWeekRange(rideWeekOf("2026-10-28"))).toBe("25.10 – 30.10");
    expect(formatWeekRange(rideWeekOf("2026-12-31"))).toBe("27.12 – 1.1");
  });
});

describe("formatTime", () => {
  it("drops the seconds", () => {
    expect(formatTime("07:15:00")).toBe("07:15");
    expect(formatTime("07:15")).toBe("07:15");
  });

  it("returns an empty string for null", () => {
    expect(formatTime(null)).toBe("");
  });
});

describe("isIsoDate", () => {
  it.each(["2026-11-02", "2024-02-29"])("accepts %s", (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(["2026-13-01", "02-11-2026", "2026-1-2", "", undefined, 20261102, null])("rejects %s", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

describe("formatMonth", () => {
  it("formats a month in Hebrew", () => {
    expect(formatMonth("2025-06")).toBe("יוני 2025");
  });
});

describe("recentMonths", () => {
  it("lists the current month and three before it, newest first", () => {
    expect(recentMonths("2026-10-25")).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
  });

  it("crosses year boundaries", () => {
    expect(recentMonths("2026-02-10", 2)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });

  it("handles month ends without skipping months", () => {
    expect(recentMonths("2026-03-31", 1)).toEqual(["2026-03", "2026-02"]);
  });
});
