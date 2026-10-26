import { describe, expect, it } from "vitest";
import { avatarColorFor, formatPrice, groupLabel, initialsOf, kindLabel, seatsText, weekdaysLabel } from "@/lib/format";

describe("groupLabel", () => {
  it("joins origin and destination with an arrow", () => {
    expect(groupLabel("בית שמש", "ירושלים")).toBe("בית שמש ← ירושלים");
  });
});

describe("initialsOf", () => {
  it.each([
    ["מלכה כהן", "מכ"],
    ["  שרה   לוי  אברהם ", "של"],
    ["דנה", "ד"],
    ["", ""],
  ])("%j → %j", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("avatarColorFor", () => {
  it("is stable for the same id", () => {
    expect(avatarColorFor("abc")).toBe(avatarColorFor("abc"));
  });

  it("always returns one of the palette colours", () => {
    for (const id of ["", "a", "11111111-1111-4111-8111-111111111111", "x".repeat(500)]) {
      expect(["coral", "lavender", "mint", "sand"]).toContain(avatarColorFor(id));
    }
  });
});

describe("kindLabel", () => {
  it("labels both kinds", () => {
    expect(kindLabel("recurring")).toBe("קבועה");
    expect(kindLabel("one_time")).toBe("חד־פעמית");
  });
});

describe("formatPrice", () => {
  it.each([
    [15, "₪15"],
    [12.5, "₪12.5"],
    [9.999, "₪10"],
    [1250, "₪1,250"],
  ])("%d → %s", (price, text) => {
    expect(formatPrice(price)).toBe(text);
  });

  it("accepts numeric strings from Postgres", () => {
    expect(formatPrice("20.00" as unknown as number)).toBe("₪20");
  });
});

describe("weekdaysLabel", () => {
  it("joins Hebrew weekday letters, with Saturday as ש׳", () => {
    expect(weekdaysLabel([0, 2, 4])).toBe("א׳ · ג׳ · ה׳");
    expect(weekdaysLabel([6])).toBe("ש׳");
    expect(weekdaysLabel([])).toBe("");
  });
});

describe("seatsText", () => {
  it("says one free seat in words and counts the rest", () => {
    expect(seatsText(1)).toBe("מקום פנוי אחד");
    expect(seatsText(3)).toBe("3 מקומות פנויים");
  });
});
