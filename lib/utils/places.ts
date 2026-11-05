import { splitPlace } from "@/lib/utils/format";

// Map areas for the places ride groups go from and to (0040), as
// [[south, west], [north, east]]: a city's box, and a place's own when it needs
// a smaller one. A place without its own box uses its city's; a place an admin
// adds in another city needs a box here too — until then its map isn't limited.
export type Area = [[number, number], [number, number]];

const PLACE_AREAS: Record<string, Area> = {
  "בית שמש": [[31.68, 34.945], [31.775, 35.025]],
  "בית שמש, רמה ג": [[31.685, 34.965], [31.725, 35.005]],
  "ירושלים": [[31.70, 35.10], [31.88, 35.26]],
  "ירושלים, הר חוצבים": [[31.788, 35.195], [31.808, 35.22]],
};

const areaOf = (name: string): Area | undefined => PLACE_AREAS[name.trim()] ?? PLACE_AREAS[splitPlace(name).city];

// The box covering a group's origin and destination (and the road between
// them), or null when either place is unknown.
export function groupArea(origin: string, destination: string): Area | null {
  const a = areaOf(origin);
  const b = areaOf(destination);
  if (!a || !b) return null;
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}
