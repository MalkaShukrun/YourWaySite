"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { MapPin } from "lucide-react";
import type { Area } from "@/lib/places";
import { iconProps } from "@/components/ui/icon";
import { isPlaced, MapLegend, MapTiles, RoutePath, stopPinIcon, useMapKey } from "./mapParts";

type EditorStop = { kind: "pickup" | "dropoff"; label: string; lat: number | null; lng: number | null };

type Props = {
  stops: EditorStop[];
  area: Area | null; // the group's two places; the map can't leave it
  placing: "pickup" | "dropoff" | null; // a stop waiting for a click on the map
  onPlace: (lat: number, lng: number) => void;
  onMove: (index: number, lat: number, lng: number) => void;
};

// Beit Shemesh ↔ Jerusalem, the area the starter ride groups cover.
const DEFAULT_CENTER: [number, number] = [31.76, 35.09];

// Optional map for the route's stops (SRS §5.1): click to place the chosen
// stop, drag a pin to move it. Stops without a location just aren't drawn.
export default function RouteEditorMap({ stops, area, placing, onPlace, onMove }: Props) {
  // Fit to the stops already on the map once, when the editor opens.
  const [initialBounds] = useState(() => {
    const placed = stops.filter(isPlaced);
    return placed.length ? L.latLngBounds(placed.map((s) => [s.lat, s.lng] as [number, number])).pad(0.2) : null;
  });
  const mapKey = useMapKey();
  const startBounds = initialBounds ?? (area ? L.latLngBounds(area) : null);
  const ordered = [...stops.filter((s) => s.kind === "pickup"), ...stops.filter((s) => s.kind === "dropoff")].filter(isPlaced);
  const numberOf = (index: number) => stops.slice(0, index + 1).filter((s) => s.kind === stops[index].kind).length;

  return (
    <div className={`large-map route-map ${placing ? "is-adding" : ""}`} dir="ltr">
      <MapContainer
        key={mapKey}
        {...(startBounds ? { bounds: startBounds } : { center: DEFAULT_CENTER, zoom: 11 })}
        maxBoundsViscosity={1}
        style={{ height: "100%", width: "100%" }}
      >
        <MapTiles />
        <LimitToArea area={area} />
        <ClickToAdd enabled={placing !== null} area={area} onAdd={onPlace} />
        <RoutePath positions={ordered.map((s) => [s.lat, s.lng])} />
        {stops.map((stop, index) => !isPlaced(stop) ? null : (
          <Marker
            key={index}
            position={[stop.lat, stop.lng]}
            draggable
            icon={stopPinIcon(stop.kind, numberOf(index))}
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                onMove(index, lat, lng);
              },
            }}
          >
            {stop.label && <Tooltip direction="top" offset={[0, -14]}>{stop.label}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
      {placing && (
        <div className="map-hint" dir="rtl">
          <MapPin {...iconProps} size={17} />
          לחצי על המפה במקום {placing === "pickup" ? "תחנת האיסוף" : "תחנת ההורדה"}
        </div>
      )}
      <MapLegend />
    </div>
  );
}

type ClickProps = { enabled: boolean; area: Area | null; onAdd: (lat: number, lng: number) => void };

// Stops can only be placed inside the group's area.
function ClickToAdd({ enabled, area, onAdd }: ClickProps) {
  useMapEvents({
    click: (e) => {
      if (!enabled || (area && !L.latLngBounds(area).contains(e.latlng))) return;
      onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Keeps the view inside the group's area: no panning out of it and no zooming
// out past it. When the driver switches group, the map jumps to the new area.
function LimitToArea({ area }: { area: Area | null }) {
  const map = useMap();
  const firstRun = useRef(true);
  const key = area ? area.flat().join(",") : "";

  useEffect(() => {
    if (!area) {
      map.setMaxBounds(null as unknown as L.LatLngBoundsExpression);
      map.setMinZoom(0);
      return;
    }
    const bounds = L.latLngBounds(area);
    const limit = bounds.pad(0.05);
    map.setMaxBounds(limit);
    map.setMinZoom(map.getBoundsZoom(limit));
    // On first load the map already shows the saved stops (or the area).
    if (!firstRun.current) map.fitBounds(bounds);
    firstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `area`
  }, [map, key]);

  return null;
}
