"use client";

import { CalendarDays, Clock, History, Repeat, X } from "lucide-react";
import { iconProps } from "@/components/ui/icon";
import { fullPlaces, type CityPicks, type RecentSearch, type SearchDetail } from "@/lib/rides/recentSearches";

export const recentOptionId = (menuId: string, index: number) => `${menuId}-${index}`;

// A recent search as the list shows it: its places by name, and its when.
export type RecentSearchView = { key: string; search: RecentSearch; origin: CityPicks[]; destination: CityPicks[]; details: SearchDetail[] };

const DETAIL_ICONS: Record<SearchDetail["type"], typeof Clock> = { date: CalendarDays, time: Clock, kind: Repeat };

// One end of a search in full: each city in bold, the neighborhoods picked
// in it after, in brackets: "ירושלים (גבעת שאול, רמות), בית שמש".
function Places({ picks, anywhere }: { picks: CityPicks[]; anywhere: string }) {
  if (!picks.length) return <span className="recent-anywhere">{anywhere}</span>;
  return picks.map(({ city, areas }, i) => (
    <span key={city} className="recent-place">
      <strong>{city}</strong>
      {areas.length > 0 && <span className="recent-areas"> ({areas.join(", ")})</span>}
      {i < picks.length - 1 && ", "}
    </span>
  ));
}

// The dropdown under smart search on every focus of its box: her 3
// latest searches, each with everything it holds — every place picked at
// both ends, the date, the departure times and the ride type. SmartSearch
// owns focus and the keyboard (↑ ↓ Enter Esc); a press here never takes
// focus from the box, so the list stays open.
export function RecentSearchesMenu({
  id,
  searches,
  active,
  onPick,
  onActive,
  onClear,
}: {
  id: string;
  searches: RecentSearchView[];
  active: number;
  onPick: (search: RecentSearchView) => void;
  onActive: (index: number) => void;
  onClear: () => void;
}) {
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div className="recent-menu">
      <p className="recent-menu-title" id={`${id}-title`}>
        <History {...iconProps} size={13} aria-hidden="true" /> חיפושים אחרונים
      </p>
      <ul role="listbox" id={id} aria-labelledby={`${id}-title`}>
        {searches.map((search, i) => {
          const { details } = search;
          const route = `${fullPlaces(search.origin, "מכל מקום")} עד ${fullPlaces(search.destination, "לכל מקום")}`;
          return (
            <li
              key={search.key}
              id={recentOptionId(id, i)}
              role="option"
              aria-selected={i === active}
              aria-label={[route, ...details.map((d) => d.text)].join(", ")}
              className={`recent-option${i === active ? " active" : ""}`}
              onMouseDown={keepFocus}
              onMouseMove={() => i !== active && onActive(i)}
              onClick={() => onPick(search)}
            >
              <History {...iconProps} size={15} aria-hidden="true" />
              <div className="recent-option-body">
                <div className="recent-option-route">
                  <Places picks={search.origin} anywhere="מכל מקום" />
                  <span className="recent-option-arrow"> ← </span>
                  <Places picks={search.destination} anywhere="לכל מקום" />
                </div>
                {details.length > 0 && (
                  <div className="recent-option-details">
                    {details.map(({ type, text }) => {
                      const Icon = DETAIL_ICONS[type];
                      return (
                        <span key={type} className={`recent-detail ${type}`}>
                          <Icon {...iconProps} size={13} aria-hidden="true" />
                          {text}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="recent-menu-clear" onMouseDown={keepFocus} onClick={onClear}>
        <X {...iconProps} size={13} aria-hidden="true" /> ניקוי החיפושים האחרונים
      </button>
    </div>
  );
}
