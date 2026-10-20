import { MapPin } from "lucide-react";

export function Logo() {
  return (
    <div className="logo-wrap">
      <div className="logo-mark">
        <span></span>
        <MapPin className="icon" size={18} strokeWidth={1.8} aria-hidden />
      </div>
      <div>
        <div className="logo-name">בדרך שלך</div>
        <div className="logo-tagline">נוסעות יחד, מגיעות רחוק</div>
      </div>
    </div>
  );
}
