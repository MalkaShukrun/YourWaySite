"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Tooltip } from "react-leaflet";
import type { Stop } from "@/lib/ride-types";
import { isPlaced, MapLegend, MapTiles, RoutePath, stopPinIcon } from "./mapParts";

// Interactive map (React Leaflet + OpenStreetMap) showing only the driver's
// route and her designated pickup / drop-off pins (SRS §4.2). Marking stops
// on the map is optional, so stops without a location are left out — their
// numbers still match the stop list.
export default function RouteMap({ stops, selectedIds = [] }: { stops: Stop[]; selectedIds?: string[] }) {
  const pickups = stops.filter((s) => s.kind === "pickup");
  const dropoffs = stops.filter((s) => s.kind === "dropoff");
  const path = [...pickups, ...dropoffs].filter(isPlaced).map((s) => [s.lat, s.lng] as [number, number]);
  const bounds = path.length ? L.latLngBounds(path).pad(0.15) : undefined;

  if (!bounds) return <div className="map-empty">הנהגת לא סימנה את התחנות על המפה.</div>;

  const markers = (list: Stop[]) =>
    list.map((stop, i) =>
      isPlaced(stop) ? (
        <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={stopPinIcon(stop.kind, i + 1, selectedIds.includes(stop.id))}>
          <Tooltip direction="top" offset={[0, -14]}>{stop.label}</Tooltip>
        </Marker>
      ) : null,
    );

  return (
    <div className="large-map route-map" dir="ltr">
      <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <MapTiles />
        <RoutePath positions={path} />
        {markers(pickups)}
        {markers(dropoffs)}
      </MapContainer>
      <MapLegend />
    </div>
  );
}
