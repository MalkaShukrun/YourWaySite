import { describe, expect, it } from "vitest";
import { isNavItemActive, modeForPath } from "@/components/shell/nav";

describe("modeForPath", () => {
  it.each([
    ["/dashboard", "driver"],
    ["/routes", "driver"],
    ["/routes/new", "driver"],
    ["/", "passenger"],
    ["/my-rides", "passenger"],
    ["/payments", "passenger"],
    ["/ride/abc", "passenger"],
    ["/profile", null],
    ["/admin/groups", null],
  ])("%s → %s", (path, mode) => {
    expect(modeForPath(path)).toBe(mode);
  });
});

describe("isNavItemActive", () => {
  it("marks home active on / and on ride pages", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/ride/abc", "/")).toBe(true);
    expect(isNavItemActive("/my-rides", "/")).toBe(false);
  });

  it("matches a section and its sub-pages", () => {
    expect(isNavItemActive("/routes", "/routes")).toBe(true);
    expect(isNavItemActive("/routes/new", "/routes")).toBe(true);
  });

  it("doesn't match a different section sharing a prefix", () => {
    expect(isNavItemActive("/routes-archive", "/routes")).toBe(false);
    expect(isNavItemActive("/payments", "/profile")).toBe(false);
  });
});
