"use client";

import "leaflet/dist/leaflet.css";
import { useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import { MapPin } from "lucide-react";

type EditorStop = { kind: "pickup" | "dropoff"; label: string; lat: number; lng: number };

type Props = {
  stops: EditorStop[];
  adding: "pickup" | "dropoff" | null;
  onAdd: (lat: number, lng: number) => void;
  onMove: (index: number, lat: number, lng: number) => void;
};

// Beit Shemesh ↔ Jerusalem, the area the starter ride groups cover.
const DEFAULT_CENTER: [number, number] = [31.76, 35.09];

// Route & stops setup on the map (SRS §5.1): click to drop a pin, drag to move it.
export default function RouteEditorMap({ stops, adding, onAdd, onMove }: Props) {
  // Fit to the existing stops once, when the editor opens.
  const [initialBounds] = useState(() =>
    stops.length ? L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])).pad(0.2) : null,
  );
  const ordered = [...stops.filter((s) => s.kind === "pickup"), ...stops.filter((s) => s.kind === "dropoff")];
  const numberOf = (index: number) => stops.slice(0, index + 1).filter((s) => s.kind === stops[index].kind).length;

  return (
    <div className={`large-map route-map ${adding ? "is-adding" : ""}`} dir="ltr">
      <MapContainer
        {...(initialBounds ? { bounds: initialBounds } : { center: DEFAULT_CENTER, zoom: 11 })}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToAdd enabled={adding !== null} onAdd={onAdd} />
        {ordered.length > 1 && (
          <Polyline positions={ordered.map((s) => [s.lat, s.lng])} pathOptions={{ color: "#176B45", weight: 5, opacity: 0.85 }} />
        )}
        {stops.map((stop, index) => (
          <Marker
            key={index}
            position={[stop.lat, stop.lng]}
            draggable
            icon={L.divIcon({
              className: "",
              html: `<span class="leaflet-stop-pin ${stop.kind === "dropoff" ? "drop" : ""}"><b>${numberOf(index)}</b></span>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
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
      {adding && (
        <div className="map-hint" dir="rtl">
          <MapPin className="icon" size={17} strokeWidth={1.8} />
          לחצי על המפה להוספת {adding === "pickup" ? "תחנת איסוף" : "תחנת הורדה"}
        </div>
      )}
      <div className="map-legend" dir="rtl">
        <span><i className="pickup-dot"></i>איסוף</span>
        <span><i className="dropoff-dot"></i>הורדה</span>
      </div>
    </div>
  );
}

function ClickToAdd({ enabled, onAdd }: { enabled: boolean; onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      if (enabled) onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
