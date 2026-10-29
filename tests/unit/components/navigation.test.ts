import { describe, expect, it } from "vitest";
import { pickSummary, toggleValue } from "@/components/ui/multiSelect";
import { adminNavItem, driverNavItems, isNavItemActive, modeForPath, passengerNavItems, profileNavItem } from "@/components/shell/nav";

// Passenger and driver modes (spec §1 Modes, A4).
describe("modeForPath", () => {
  it.each(["/dashboard", "/dashboard?date=2026-11-01", "/routes", "/routes/new", "/routes/abc"])("%s is a driver page", (path) => {
    expect(modeForPath(path)).toBe("driver");
  });

  it.each(["/", "/my-rides", "/payments", "/ride/abc"])("%s is a passenger page", (path) => {
    expect(modeForPath(path)).toBe("passenger");
  });

  // The profile and group pages keep whichever mode was used last.
  it.each(["/profile", "/admin/groups"])("%s belongs to both modes", (path) => {
    expect(modeForPath(path)).toBeNull();
  });
});

describe("menus", () => {
  it("has the passenger menu: search, my rides, payments", () => {
    expect(passengerNavItems.map((i) => [i.href, i.label, i.shortLabel])).toEqual([
      ["/", "מציאת נסיעה", "חיפוש"],
      ["/my-rides", "הנסיעות שלי", "נסיעות"],
      ["/payments", "מעקב תשלומים", "תשלומים"],
    ]);
  });

  it("has the driver menu: weekly dashboard, my routes", () => {
    expect(driverNavItems.map((i) => [i.href, i.label, i.shortLabel])).toEqual([
      ["/dashboard", "לוח נהגת שבועי", "השבוע"],
      ["/routes", "המסלולים שלי", "מסלולים"],
    ]);
  });

  it("has the shared items: profile, and group management for admins", () => {
    expect([profileNavItem.label, adminNavItem.label]).toEqual(["הפרופיל שלי", "ניהול קבוצות"]);
  });
});

describe("isNavItemActive", () => {
  it("marks search on the home page and on a ride page", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/ride/abc", "/")).toBe(true);
    expect(isNavItemActive("/my-rides", "/")).toBe(false);
  });

  it("marks an item on its own page and the pages under it", () => {
    expect(isNavItemActive("/routes", "/routes")).toBe(true);
    expect(isNavItemActive("/routes/new", "/routes")).toBe(true);
    expect(isNavItemActive("/routes-old", "/routes")).toBe(false);
    expect(isNavItemActive("/dashboard", "/routes")).toBe(false);
  });
});

// The search's route-group filter takes several groups (spec C1).
describe("route-group multi-select", () => {
  const options = [
    { value: "a", label: "בית שמש ← ירושלים" },
    { value: "b", label: "ירושלים ← בית שמש" },
    { value: "c", label: "הר חוצבים ← בית שמש" },
  ];

  it("adds and removes picks", () => {
    expect(toggleValue([], "a")).toEqual(["a"]);
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("clears every pick with 'all'", () => {
    expect(toggleValue(["a", "b"], "")).toEqual([]);
  });

  it("summarises the picks in the options' order", () => {
    expect(pickSummary(options, [], "כל המסלולים")).toBe("כל המסלולים");
    expect(pickSummary(options, ["b"], "כל המסלולים")).toBe("ירושלים ← בית שמש");
    expect(pickSummary(options, ["c", "a"], "כל המסלולים")).toBe("בית שמש ← ירושלים +1");
    expect(pickSummary(options, ["a", "b", "c"], "כל המסלולים")).toBe("בית שמש ← ירושלים +2");
  });

  it("ignores picks that aren't options any more (a hidden group)", () => {
    expect(pickSummary(options, ["gone"], "כל המסלולים")).toBe("כל המסלולים");
  });
});
