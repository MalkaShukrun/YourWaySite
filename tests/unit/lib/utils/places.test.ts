import { describe, expect, it } from "vitest";
import { groupArea } from "@/lib/utils/places";

// Pins can only be placed inside the group's map area (spec B3, H1).
describe("groupArea", () => {
  it("covers both places of the group and the road between them", () => {
    expect(groupArea("בית שמש", "ירושלים")).toEqual([
      [31.68, 34.945],
      [31.88, 35.26],
    ]);
  });

  it("is the same box in either direction", () => {
    expect(groupArea("ירושלים", "בית שמש")).toEqual(groupArea("בית שמש", "ירושלים"));
  });

  it("is a place's own box when the other is inside it", () => {
    expect(groupArea("ירושלים", "הר חוצבים")).toEqual([
      [31.7, 35.1],
      [31.88, 35.26],
    ]);
  });

  it("ignores spaces around the names", () => {
    expect(groupArea(" בית שמש ", "ירושלים ")).toEqual(groupArea("בית שמש", "ירושלים"));
  });

  // A place without a map area can still be used, but its map isn't limited (spec H1).
  it("is null when either place has no map area", () => {
    expect(groupArea("תל אביב", "ירושלים")).toBeNull();
    expect(groupArea("ירושלים", "חיפה")).toBeNull();
  });
});
