"use client";

import L from "leaflet";
import { Polyline, TileLayer } from "react-leaflet";
import type { Stop } from "@/lib/ride-types";

// Pieces shared by the route map and the route editor's map.

type Located = { lat: number | null; lng: number | null };

// Marking a stop on the map is optional; stops without a location aren't drawn.
export function isPlaced<T extends Located>(stop: T): stop is T & { lat: number; lng: number } {
  return stop.lat !== null && stop.lng !== null;
}

export function MapTiles() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}

// The line through the placed stops, pickups first.
export function RoutePath({ positions }: { positions: [number, number][] }) {
  if (positions.length < 2) return null;
  return <Polyline positions={positions} pathOptions={{ color: "#2A4A60", weight: 5, opacity: 0.85 }} />;
}

// A numbered pickup / drop-off pin.
export function stopPinIcon(kind: Stop["kind"], number: number, selected = false) {
  return L.divIcon({
    className: "",
    html: `<span class="leaflet-stop-pin ${kind === "dropoff" ? "drop" : ""} ${selected ? "selected" : ""}"><b>${number}</b></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function MapLegend() {
  return (
    <div className="map-legend" dir="rtl">
      <span><i className="pickup-dot"></i>איסוף</span>
      <span><i className="dropoff-dot"></i>הורדה</span>
    </div>
  );
}
