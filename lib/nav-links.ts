// Turn-by-turn navigation links for a stop (SRS §5.2): to its pin, or a
// search by name for a stop that isn't marked on the map.
type Place = { lat: number; lng: number } | string;

export function wazeUrl(place: Place) {
  return typeof place === "string"
    ? `https://waze.com/ul?q=${encodeURIComponent(place)}&navigate=yes`
    : `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`;
}
export function googleMapsUrl(place: Place) {
  const destination = typeof place === "string" ? encodeURIComponent(place) : `${place.lat},${place.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
