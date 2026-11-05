// The pickup / drop-off colors, beside a stop list (stop-legend) or on a map
// (map-legend).
export function StopLegend({ className }: { className: "stop-legend" | "map-legend" }) {
  return (
    <div className={className} dir="rtl">
      <span><i className="pickup-dot"></i>איסוף</span>
      <span><i className="dropoff-dot"></i>הורדה</span>
    </div>
  );
}
