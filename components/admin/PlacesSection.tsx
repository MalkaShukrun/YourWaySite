import { MapPin } from "lucide-react";
import type { AdminGroup, Place } from "@/lib/admin/data";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { PlaceName } from "@/components/ui/PlaceName";
import { PlaceDialog } from "@/components/admin/PlaceDialog";
import { PlaceActions } from "@/components/admin/PlaceActions";
import { iconProps } from "@/components/ui/icon";

const groupCountLabel = (n: number) => (n === 0 ? "אין קבוצות" : n === 1 ? "קבוצה אחת" : `${n} קבוצות`);

// The places groups go from and to (0040), with how many groups use each.
// Render only for admins (the caller checks with requireAdmin and loads both lists).
export function PlacesSection({ places, groups }: { places: Place[]; groups: AdminGroup[] }) {
  const groupCount = (id: string) => groups.filter((g) => g.origin_place_id === id || g.destination_place_id === id).length;

  return (
    <CollapsiblePanel title="מקומות" subtitle="עיר ושכונה. כל קבוצה נוסעת ממקום אחד ברשימה למקום אחר">
      <div className="panel-toolbar"><PlaceDialog /></div>
      {places.length === 0 ? (
        <div className="empty-state"><strong>עדיין אין מקומות</strong><span>הוסיפי מקומות, ואז צרי קבוצה ממקום אחד לאחר.</span></div>
      ) : (
        places.map((place) => {
          const count = groupCount(place.id);
          return (
            <div key={place.id} className="group-row place-row">
              <span className="route-badge"><MapPin {...iconProps} size={20} /></span>
              <div>
                <strong><PlaceName name={place.name} /></strong>
                <span>{groupCountLabel(count)}</span>
              </div>
              <PlaceActions place={{ id: place.id, city: place.city, neighborhood: place.neighborhood }} groupCount={count} />
            </div>
          );
        })
      )}
    </CollapsiblePanel>
  );
}
