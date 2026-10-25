import type { ReactNode } from "react";

// A number with an icon and a caption — the design's summary tiles.
export function StatCard({ icon, value, label, tone }: { icon: ReactNode; value: string | number; label: string; tone: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}
