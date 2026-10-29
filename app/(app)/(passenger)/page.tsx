import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { greetingFor, isIsoDate, israelHour, israelToday } from "@/lib/utils/dates";
import { getRideGroups, searchRides } from "@/lib/rides/data";
import type { RideKind } from "@/lib/rides/types";
import { firstNameOf } from "@/lib/utils/format";
import { groupByRoute, groupIdsFrom } from "@/lib/rides/search";
import { TIME_PATTERN } from "@/lib/validation/patterns";
import { SearchPanel } from "@/components/passenger/SearchPanel";
import { RideCard } from "@/components/passenger/RideCard";

type SearchParams = PageProps<"/">["searchParams"];

export const metadata: Metadata = { title: "חיפוש נסיעה" };

// Passenger home — ride search (SRS §4.1).
export default function FindRidePage({ searchParams }: PageProps<"/">) {
  return (
    <main className="page-content page-wide">
      <Suspense fallback={<div className="welcome"><div><p>&nbsp;</p><h1>בואי נמצא לך טרמפ</h1></div></div>}>
        <Welcome />
      </Suspense>
      <Suspense fallback={<section className="search-card search-placeholder" aria-busy="true" />}>
        <Search searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ResultsHead subtitle="טוען נסיעות…" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function readFilters(searchParams: SearchParams) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const date = one("date");
  const kind = one("kind");
  const time = (key: string) => {
    const value = one(key);
    return value && TIME_PATTERN.test(value) ? value : undefined;
  };
  let [from, to] = [time("from"), time("to")];
  // "From 09:00 until 07:00" means the other way round.
  if (from && to && from > to) [from, to] = [to, from];
  return {
    groupIds: groupIdsFrom(params.group),
    date: isIsoDate(date) && date >= (await israelToday()) ? date : undefined,
    kind: kind === "recurring" || kind === "one_time" ? (kind as RideKind) : undefined,
    from,
    to,
  };
}

async function Welcome() {
  const user = await requireUser();
  const firstName = firstNameOf(user.fullName);
  const hour = await israelHour();
  return (
    <div className="welcome">
      <div>
        <p>{greetingFor(hour)}, {firstName}</p>
        <h1>בואי נמצא לך טרמפ</h1>
      </div>
    </div>
  );
}

async function Search({ searchParams }: { searchParams: SearchParams }) {
  const [groups, filters, today] = await Promise.all([getRideGroups(), readFilters(searchParams), israelToday()]);
  return <SearchPanel groups={groups} initial={filters} today={today} />;
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const [user, filters] = await Promise.all([requireUser(), readFilters(searchParams)]);
  const rides = await searchRides(filters);
  const routes = groupByRoute(rides);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <ResultsHead subtitle={filtered ? `${routes.length} תוצאות` : ""} />
      {rides.length === 0 ? (
        <div className="panel empty-state">
          <strong>לא נמצאו נסיעות מתאימות</strong>
          <span>נסי לשנות את התאריך, השעה או המסלול.</span>
        </div>
      ) : (
        <div className="trip-grid">
          {routes.map((dates) => (
            <RideCard key={dates[0].route_id} rides={dates} own={dates[0].driver_id === user.id} />
          ))}
        </div>
      )}
    </>
  );
}

function ResultsHead({ subtitle }: { subtitle: string }) {
  return (
    <div className="results-head">
      <div><h2>נסיעות זמינות</h2><span>{subtitle}</span></div>
    </div>
  );
}
