import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatRideDate } from "@/lib/utils/dates";
import { getMyAlerts, getRideGroups } from "@/lib/rides/data";
import { getDailyEmailValues, getRideEmailsValues } from "@/lib/profile/data";
import { DailyEmailForm } from "@/components/profile/DailyEmailForm";
import { RideEmailsForm } from "@/components/profile/RideEmailsForm";
import { MAX_RIDE_ALERTS } from "@/lib/rides/types";
import { alertDates, alertLastDay, alertTimes } from "@/lib/rides/alerts";
import { describePlaces, fullPlaces, placeNames } from "@/lib/rides/recentSearches";
import { CancelAlertButton } from "@/components/passenger/CancelAlertButton";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";

export const metadata: Metadata = { title: "ההתראות שלי" };

// "ההתראות שלי" (spec C11), in the passenger menu: her ride alerts that
// haven't expired, each with "ביטול". The email's "הסרת ההתראה" link opens it
// with ?alert=<id>: that alert is highlighted, and she decides whether to cancel it.
// Below them, her email settings: the emails about her rides (A7) and the driver's daily email (D7).
export default function AlertsPage({ searchParams }: PageProps<"/alerts">) {
  return (
    <main className="page-content">
      <div className="welcome"><div><h1>ההתראות שלי</h1></div></div>
      <Suspense fallback={<section className="panel" aria-busy="true" />}>
        <MyAlerts searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MyAlerts({ searchParams }: Pick<PageProps<"/alerts">, "searchParams">) {
  const user = await requireUser();
  const [query, alerts, groups, rideEmails, dailyEmail] = await Promise.all([
    searchParams,
    getMyAlerts(),
    getRideGroups(),
    getRideEmailsValues(user.id),
    getDailyEmailValues(user.id),
  ]);
  const highlight = typeof query.alert === "string" ? query.alert : undefined;
  const places = placeNames(groups);

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>התראות פעילות</h2>
            <span>נשלח לך מייל כשתפורסם נסיעה חדשה שמתאימה, או כשיתפנה מקום בנסיעה מלאה שמתאימה</span>
          </div>
          <span className="count-pill">{alerts.length} מתוך {MAX_RIDE_ALERTS}</span>
        </div>
        {alerts.length === 0 ? (
          <div className="empty-state">
            <strong>אין לך התראות פעילות</strong>
            <span>לא מצאת נסיעה? אנחנו נעדכן אותך כשתיכנס נסיעה מתאימה</span>
            <Link className="btn btn-primary" href="/">מציאת נסיעה</Link>
          </div>
        ) : (
          alerts.map((alert) => {
            const { origin, destination } = describePlaces({ origins: alert.origins, destinations: alert.destinations }, places);
            const details = [alertDates(alert), alertTimes(alert)].filter(Boolean);
            const highlighted = alert.id === highlight;
            return (
              <div key={alert.id} className={`activity-row alert-row ${highlighted ? "row-highlighted" : ""}`}>
                <div className="activity-route">
                  <BellRing {...iconProps} size={20} />
                  <div>
                    <strong>
                      <bdi dir="rtl">{fullPlaces(origin, "מקום שאינו זמין")} ← {fullPlaces(destination, "מקום שאינו זמין")}</bdi>
                    </strong>
                    <span>{details.length ? details.join(" · ") : "כל תאריך וכל שעה"}</span>
                  </div>
                </div>
                <div className="activity-stops">
                  <span>בתוקף עד {formatRideDate(alertLastDay(alert.expires_at))}</span>
                </div>
                <div className="row-actions">
                  <CancelAlertButton alertId={alert.id} highlighted={highlighted} />
                </div>
              </div>
            );
          })
        )}
      </section>
      <RideEmailsForm email={user.email} defaults={rideEmails} />
      <DailyEmailForm email={user.email} defaults={dailyEmail} />
      <Toast message={query.cancelled === "1" ? "ההתראה בוטלה" : ""} />
    </>
  );
}
