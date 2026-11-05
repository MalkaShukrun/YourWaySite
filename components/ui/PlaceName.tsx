import { splitPlace } from "@/lib/utils/format";

// A place on a card: its city, and its neighborhood on the line under it, or
// after it on the same line when `inline`. The comma keeps the full name,
// "city, neighborhood", for screen readers and copied text; it shows only
// inline. <bdi> because the cards style their own spans; the outer ones keep
// the page's right-to-left layout whatever the names are.
export function PlaceName({ name, inline = false }: { name: string; inline?: boolean }) {
  const { city, neighborhood } = splitPlace(name);
  return (
    <bdi className={`place-name ${inline ? "inline" : ""}`} dir="rtl">
      <bdi className="place-city">{city}</bdi>
      {neighborhood && (
        <>
          <span className={inline ? "" : "visually-hidden"}>, </span>
          <bdi className="place-area">{neighborhood}</bdi>
        </>
      )}
    </bdi>
  );
}

// "origin ← destination", each place on one line.
export function GroupName({ origin, destination }: { origin: string; destination: string }) {
  return (
    <bdi className="group-name" dir="rtl">
      <PlaceName name={origin} inline />
      {" ← "}
      <PlaceName name={destination} inline />
    </bdi>
  );
}
