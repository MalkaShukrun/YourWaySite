// Map areas for the place names used in ride groups, as
// [[south, west], [north, east]]. Ride groups store only names, so a place an
// admin adds later needs a box here too — until then its map isn't limited.
export type Area = [[number, number], [number, number]];

const PLACE_AREAS: Record<string, Area> = {
  "בית שמש": [[31.68, 34.945], [31.775, 35.025]],
  "רמת בית שמש": [[31.685, 34.965], [31.725, 35.005]],
  "ירושלים": [[31.70, 35.10], [31.88, 35.26]],
  "הר חוצבים": [[31.788, 35.195], [31.808, 35.22]],
};

// The box covering a group's origin and destination (and the road between
// them), or null when either place is unknown.
export function groupArea(origin: string, destination: string): Area | null {
  const a = PLACE_AREAS[origin.trim()];
  const b = PLACE_AREAS[destination.trim()];
  if (!a || !b) return null;
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}
