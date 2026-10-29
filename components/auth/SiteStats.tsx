import type { ReactNode } from "react";
import { Route, Users } from "lucide-react";
import { getSiteStats, type SiteStats as Stats } from "@/lib/stats";
import { CountUp } from "./CountUp";
import { iconProps } from "@/components/ui/icon";

const ITEMS: { key: keyof Stats; label: string; icon: ReactNode }[] = [
  { key: "members", label: "משתמשות במערכת", icon: <Users {...iconProps} size={22} /> },
  { key: "routes", label: "מסלולים פעילים", icon: <Route {...iconProps} size={22} /> },
];

// The login page's stats row: site-wide totals that count up into view.
export async function SiteStats() {
  const stats = await getSiteStats();
  if (!stats) return null;

  return (
    <section className="site-stats" aria-label="בדרך שלך במספרים">
      <ul>
        {ITEMS.map(({ key, label, icon }) => (
          <li key={key}>
            <span className="site-stat-icon">{icon}</span>
            <div>
              <strong>
                <CountUp value={stats[key]} />
              </strong>
              <small>{label}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
