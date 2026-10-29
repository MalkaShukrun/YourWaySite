import { describe, expect, it } from "vitest";
import {
  avatarColorFor,
  firstNameOf,
  formatPrice,
  groupLabel,
  initialsOf,
  kindLabel,
  RIDE_WEEKDAYS,
  routeKindLabel,
  seatsText,
  WEEKDAY_LETTERS,
  weekdaysLabel,
} from "@/lib/utils/format";

describe("labels", () => {
  it("joins a group's origin and destination with an arrow", () => {
    expect(groupLabel("בית שמש", "ירושלים")).toBe("בית שמש ← ירושלים");
  });

  it("names the ride kind for passengers and for drivers", () => {
    expect(kindLabel("recurring")).toBe("קבועה");
    expect(kindLabel("one_time")).toBe("חד־פעמית");
    expect(routeKindLabel("recurring")).toBe("מסלול קבוע");
    expect(routeKindLabel("one_time")).toBe("נסיעה חד־פעמית");
  });

  it("counts free seats in words", () => {
    expect(seatsText(1)).toBe("מקום פנוי אחד");
    expect(seatsText(0)).toBe("0 מקומות פנויים");
    expect(seatsText(3)).toBe("3 מקומות פנויים");
  });
});

describe("names", () => {
  it("takes the first name", () => {
    expect(firstNameOf("רחל לוי")).toBe("רחל");
    expect(firstNameOf("רחל")).toBe("רחל");
  });

  it("takes up to two initials, ignoring extra spaces", () => {
    expect(initialsOf("רחל לוי")).toBe("רל");
    expect(initialsOf("  שרה   בת  אברהם ")).toBe("שב");
    expect(initialsOf("מרים")).toBe("מ");
    expect(initialsOf("")).toBe("");
  });

  it("gives each user a stable avatar colour from a fixed set", () => {
    const colors = ["coral", "lavender", "mint", "sand"];
    const ids = ["a", "b", "c", "11111111-1111-4111-8111-111111111111", "x".repeat(200)];
    for (const id of ids) {
      expect(colors).toContain(avatarColorFor(id));
      expect(avatarColorFor(id)).toBe(avatarColorFor(id));
    }
  });
});

describe("formatPrice", () => {
  it.each([
    [15, "₪15"],
    [0, "₪0"],
    [12.5, "₪12.5"],
    [9.99, "₪9.99"],
    [1234, "₪1,234"],
    [9999.99, "₪9,999.99"],
  ])("%d → %s", (price, text) => {
    expect(formatPrice(price)).toBe(text);
  });

  it("accepts the database's numeric strings", () => {
    expect(formatPrice("20.00" as unknown as number)).toBe("₪20");
  });
});

describe("weekdays", () => {
  it("has seven letters, Sunday first", () => {
    expect(WEEKDAY_LETTERS).toEqual(["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]);
  });

  // Recurring routes run Sunday to Friday (spec §2 Routes).
  it("offers Sunday to Friday for recurring routes", () => {
    expect(RIDE_WEEKDAYS).toEqual(["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"]);
  });

  it("labels a route's weekdays", () => {
    expect(weekdaysLabel([0, 2, 4])).toBe("א׳ · ג׳ · ה׳");
    expect(weekdaysLabel([])).toBe("");
  });
});
