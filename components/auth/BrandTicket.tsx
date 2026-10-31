import { Car, Clock, Users } from "lucide-react";
import { carIconProps, iconProps } from "@/components/ui/icon";

export function BrandTicket() {
  return (
    <div className="brand-ticket" aria-hidden="true">
      <div className="ticket-route">
        <div><small>יציאה</small><strong>בית שמש</strong></div>
        <span className="ticket-line"><i></i><Car {...carIconProps} size={22} /><i></i></span>
        <div><small>יעד</small><strong>ירושלים</strong></div>
      </div>
      <div className="ticket-meta">
        <span><Clock {...iconProps} size={17} /> 07:15</span>
        <span><Users {...iconProps} size={17} /> 2 מקומות פנויים</span>
        <b>₪15</b>
      </div>
    </div>
  );
}
