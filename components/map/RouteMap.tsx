"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { Stop } from "@/lib/ride-types";

type PlacedStop = Stop & { lat: number; lng: number };
const isPlaced = (s: Stop): s is PlacedStop => s.lat !== null && s.lng !== null;

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

  const pin = (stop: Stop, index: number) =>
    L.divIcon({
      className: "",
      html: `<span class="leaflet-stop-pin ${stop.kind === "dropoff" ? "drop" : ""} ${selectedIds.includes(stop.id) ? "selected" : ""}"><b>${index + 1}</b></span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

  const markers = (list: Stop[]) =>
    list.map((stop, i) =>
      isPlaced(stop) ? (
        <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={pin(stop, i)}>
          <Tooltip direction="top" offset={[0, -14]}>{stop.label}</Tooltip>
        </Marker>
      ) : null,
    );

  return (
    <div className="large-map route-map" dir="ltr">
      <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: "#2A4A60", weight: 5, opacity: 0.85 }} />}
        {markers(pickups)}
        {markers(dropoffs)}
      </MapContainer>
      <div className="map-legend" dir="rtl">
        <span><i className="pickup-dot"></i>איסוף</span>
        <span><i className="dropoff-dot"></i>הורדה</span>
      </div>
    </div>
  );
}
