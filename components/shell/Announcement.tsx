import Link from "next/link";
import { BellRing } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

const ANNOUNCEMENT = "חדש! קבלי התראות במייל על הטרמפיסטיות שלך, בתזמון שאפשר להתאים בפרופיל.";

// Feature announcement: a card in the sidebar, and only the pulsing bell in the
// top bar, for phones, where the sidebar is hidden.
export function Announcement({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/profile"
      className={compact ? "header-announce" : "side-announce"}
      title={ANNOUNCEMENT}
      aria-label={ANNOUNCEMENT}
    >
      <span className="announce-bell"><BellRing {...iconProps} size={18} /></span>
      {!compact && (
        <span className="announce-text">
          <strong>חדש!</strong> קבלי התראות במייל על הטרמפיסטיות שלך, בתזמון שאפשר להתאים בפרופיל.
        </span>
      )}
    </Link>
  );
}
