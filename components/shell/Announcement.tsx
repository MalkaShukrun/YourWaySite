import Link from "next/link";
import { BellRing } from "lucide-react";
import { iconProps } from "@/components/ui/icon";
import type { Mode } from "./nav";

// The news for each mode: the ride emails (spec A7) each side now gets, and for
// drivers also the daily passenger email (D7).
const ANNOUNCEMENTS: Record<Mode, string[]> = {
  passenger: ["מעכשיו תקבלי מייל כשאת נרשמת לנסיעה או מבטלת, וכשהנהגת מבטלת נסיעה שלך. אפשר להפסיק בפרופיל."],
  driver: [
    "קבלי התראות במייל על הטרמפיסטיות שלך, בתזמון שאפשר להתאים בפרופיל.",
    "מעכשיו תקבלי מייל כשטרמפיסטית מבטלת הרשמה לנסיעה שלך. אפשר להפסיק בפרופיל.",
  ],
};

const label = (text: string) => `חדש! ${text}`;

// Feature announcements: a card each in the sidebar, and only one pulsing bell
// in the top bar, for phones, where the sidebar is hidden.
export function Announcement({ mode, compact = false }: { mode: Mode; compact?: boolean }) {
  const texts = ANNOUNCEMENTS[mode];
  if (compact) {
    const all = texts.map(label).join(" ");
    return (
      <Link href="/profile" className="header-announce" title={all} aria-label={all}>
        <span className="announce-bell"><BellRing {...iconProps} size={18} /></span>
      </Link>
    );
  }
  return texts.map((text) => (
    <Link key={text} href="/profile" className="side-announce" title={label(text)} aria-label={label(text)}>
      <span className="announce-bell"><BellRing {...iconProps} size={18} /></span>
      <span className="announce-text">
        <strong>חדש!</strong> {text}
      </span>
    </Link>
  ));
}
