"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Polyline, TileLayer, useMap } from "react-leaflet";
import type { Stop } from "@/lib/rides/types";

// Pieces shared by the route map and the route editor's map.

// Next keeps visited pages alive in <Activity>, so React can clean up a map's
// effects and run them again without unmounting it. react-leaflet removes the
// Leaflet map on that cleanup and never makes a new one, and its layers then
// crash adding themselves to the removed map. Used as MapContainer's key, this
// changes on every cleanup, so the map comes back as a fresh instance.
export function useMapKey() {
  const [key, setKey] = useState(0);
  useEffect(() => () => setKey((k) => k + 1), []);
  return key;
}

// A map made while its box is hidden or still growing (a folded ride card)
// sizes itself to that box and draws only a corner. Redraws it, framed on
// `bounds` again, whenever the box changes size.
export function FitWhenResized({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  });
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      if (map.getSize().x > 0) map.fitBounds(boundsRef.current);
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
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
