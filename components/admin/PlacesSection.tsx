import { ChevronDown, MapPin } from "lucide-react";
import type { AdminGroup, Place } from "@/lib/admin/data";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { FoldAll } from "@/components/ui/FoldAll";
import { PlaceDialog } from "@/components/admin/PlaceDialog";
import { PlaceActions } from "@/components/admin/PlaceActions";
import { iconProps } from "@/components/ui/icon";

const groupCountLabel = (n: number) => (n === 0 ? "אין קבוצות" : n === 1 ? "קבוצה אחת" : `${n} קבוצות`);
const placeCountLabel = (n: number) => (n === 1 ? "מקום אחד" : `${n} מקומות`);

// The places groups go from and to (0040), with how many groups use each,
// folded by city, with "open all" / "collapse all" above. Render only for admins (the caller checks with requireAdmin
// and loads both lists, the places already by city and then neighborhood).
export function PlacesSection({ places, groups }: { places: Place[]; groups: AdminGroup[] }) {
  const groupCount = (id: string) => groups.filter((g) => g.origin_place_id === id || g.destination_place_id === id).length;
  const cities = Map.groupBy(places, (place) => place.city);

  return (
    <CollapsiblePanel title="מקומות" subtitle="עיר ושכונה. כל קבוצה נוסעת ממקום אחד ברשימה למקום אחר" action={<PlaceDialog />}>
      {places.length === 0 ? (
        <div className="empty-state"><strong>עדיין אין מקומות</strong><span>הוסיפי מקומות, ואז צרי קבוצה ממקום אחד לאחר.</span></div>
      ) : (
        <FoldAll className="places-fold-all">{[...cities].map(([city, cityPlaces]) => (
          <details key={city} className="place-city-group" open>
            <summary className="group-row place-city-head">
              <span className="route-badge"><MapPin {...iconProps} size={20} /></span>
              <div>
                <strong><bdi>{city}</bdi></strong>
                <span>{placeCountLabel(cityPlaces.length)}</span>
              </div>
              <ChevronDown {...iconProps} size={20} className="week-day-chevron" />
            </summary>
            {cityPlaces.map((place) => {
              const count = groupCount(place.id);
              return (
                <div key={place.id} className="group-row place-row">
                  <div>
                    {/* The city is on the heading above; screen readers and copied text still get the full name. */}
                    <strong><span className="visually-hidden">{place.city}, </span><bdi className="place-area">{place.neighborhood}</bdi></strong>
                    <span>{groupCountLabel(count)}</span>
                  </div>
                  <PlaceActions place={{ id: place.id, city: place.city, neighborhood: place.neighborhood }} groupCount={count} />
                </div>
              );
            })}
          </details>
        ))}</FoldAll>
      )}
    </CollapsiblePanel>
  );
}
