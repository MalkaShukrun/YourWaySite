import { describe, expect, it } from "vitest";
import { isActive, routeMode } from "./nav";

describe("routeMode", () => {
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
    expect(routeMode(path)).toBe(mode);
  });
});

describe("isActive", () => {
  it("marks home active on / and on ride pages", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/ride/abc", "/")).toBe(true);
    expect(isActive("/my-rides", "/")).toBe(false);
  });

  it("matches a section and its sub-pages", () => {
    expect(isActive("/routes", "/routes")).toBe(true);
    expect(isActive("/routes/new", "/routes")).toBe(true);
  });

  it("doesn't match a different section sharing a prefix", () => {
    expect(isActive("/routes-archive", "/routes")).toBe(false);
    expect(isActive("/payments", "/profile")).toBe(false);
  });
});
