import { Car, MapPin } from "lucide-react";

export function AuthRoadIllustration({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`auth-road-scene ${mobile ? "mobile-road-scene" : ""}`} aria-hidden="true">
      <span className="scene-circle circle-one"></span>
      <span className="scene-circle circle-two"></span>
      <div className="scene-road"><i></i><i></i><i></i><i></i></div>
      <span className="scene-pin pin-start"><MapPin className="icon" size={22} strokeWidth={1.8} /></span>
      <span className="scene-pin pin-end"><MapPin className="icon" size={22} strokeWidth={1.8} /></span>
      <div className="scene-car">
        <Car className="icon" size={48} strokeWidth={1.8} />
        <span></span>
      </div>
    </div>
  );
}
