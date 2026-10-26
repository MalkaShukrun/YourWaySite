import { describe, expect, it } from "vitest";
import { groupArea } from "@/lib/places";

describe("groupArea", () => {
  it("covers both places", () => {
    expect(groupArea("בית שמש", "ירושלים")).toEqual([
      [31.68, 34.945],
      [31.88, 35.26],
    ]);
  });

  it("is the same in both directions", () => {
    expect(groupArea("ירושלים", "בית שמש")).toEqual(groupArea("בית שמש", "ירושלים"));
  });

  it("ignores surrounding spaces", () => {
    expect(groupArea(" רמת בית שמש ", "הר חוצבים ")).toEqual([
      [31.685, 34.965],
      [31.808, 35.22],
    ]);
  });

  it("returns null when a place is unknown", () => {
    expect(groupArea("תל אביב", "ירושלים")).toBeNull();
    expect(groupArea("ירושלים", "")).toBeNull();
  });
});
