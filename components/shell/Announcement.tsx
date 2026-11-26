import Link from "next/link";
import { BellRing } from "lucide-react";
import { iconProps } from "@/components/ui/icon";
import type { Mode } from "./nav";

// The news for each mode: the ride emails (spec A7) each side now gets, and for
// drivers also the daily passenger email (D7).
const ANNOUNCEMENTS: Record<Mode, string[]> = {
  passenger: ["עדכנו אותי כשנכנסת נסיעה או כשמתפנה מקום בנסיעה."],
  driver: ["קבלי מייל יומי על הנוסעות שמצטרפות לנסיעה שלך. יש להפעיל בעמוד ההתראות."],
};

// A click leads to "ההתראות שלי", where the alerts and the email settings are.
const href = "/alerts";

const label = (text: string) => `חדש! ${text}`;

// Feature announcements: a card each in the sidebar, and only one pulsing bell
// in the top bar, for phones, where the sidebar is hidden.
export function Announcement({ mode, compact = false }: { mode: Mode; compact?: boolean }) {
  const texts = ANNOUNCEMENTS[mode];
  if (compact) {
    const all = texts.map(label).join(" ");
    return (
      <Link href={href} className="header-announce" title={all} aria-label={all}>
        <span className="announce-bell"><BellRing {...iconProps} size={18} /></span>
      </Link>
    );
  }
  return texts.map((text) => (
    <Link key={text} href={href} className="side-announce" title={label(text)} aria-label={label(text)}>
      <span className="announce-bell"><BellRing {...iconProps} size={18} /></span>
      <span className="announce-text">
        <strong>חדש!</strong> {text}
      </span>
    </Link>
  ));
}
