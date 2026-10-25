import { MapPin } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

export function Logo() {
  return (
    <div className="logo-wrap">
      <div className="logo-mark">
        <span></span>
        <MapPin {...iconProps} size={18} aria-hidden />
      </div>
      <div>
        <div className="logo-name">בדרך שלך</div>
        <div className="logo-tagline">נוסעות יחד, מגיעות רחוק</div>
      </div>
    </div>
  );
}
