import { Car, MapPin } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

export function AuthRoadIllustration({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`auth-road-scene ${mobile ? "mobile-road-scene" : ""}`} aria-hidden="true">
      <span className="scene-circle circle-one"></span>
      <span className="scene-circle circle-two"></span>
      <div className="scene-road"><i></i><i></i><i></i><i></i></div>
      <span className="scene-pin pin-start"><MapPin {...iconProps} size={22} /></span>
      <span className="scene-pin pin-end"><MapPin {...iconProps} size={22} /></span>
      <div className="scene-car">
        <Car {...iconProps} size={48} />
        <span></span>
      </div>
    </div>
  );
}
