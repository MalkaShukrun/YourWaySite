import { describe, expect, it } from "vitest";
import { pickSummary, toggleValue } from "@/components/ui/multiSelect";

describe("toggleValue", () => {
  it("adds an option that isn't picked, after the earlier picks", () => {
    expect(toggleValue([], "a")).toEqual(["a"]);
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes an option that's already picked", () => {
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleValue(["a"], "a")).toEqual([]);
  });

  it("clears every pick on the 'all' option", () => {
    expect(toggleValue(["a", "b"], "")).toEqual([]);
    expect(toggleValue([], "")).toEqual([]);
  });
});

describe("pickSummary", () => {
  const options = [
    { value: "a", label: "בית שמש ← ירושלים" },
    { value: "b", label: "בית שמש ← הר חוצבים" },
    { value: "c", label: "ירושלים ← בית שמש" },
  ];

  it("shows the 'all' label when nothing is picked", () => {
    expect(pickSummary(options, [], "כל המסלולים")).toBe("כל המסלולים");
  });

  it("shows a single pick by name", () => {
    expect(pickSummary(options, ["b"], "כל המסלולים")).toBe("בית שמש ← הר חוצבים");
  });

  it("shows the first pick, in the list's order, and how many more", () => {
    expect(pickSummary(options, ["c", "a"], "כל המסלולים")).toBe("בית שמש ← ירושלים +1");
    expect(pickSummary(options, ["c", "b", "a"], "כל המסלולים")).toBe("בית שמש ← ירושלים +2");
  });

  it("ignores picks that are no longer in the list", () => {
    expect(pickSummary(options, ["gone"], "כל המסלולים")).toBe("כל המסלולים");
  });
});
