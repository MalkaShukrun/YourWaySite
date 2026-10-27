import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { greetingFor, isIsoDate, israelHour, israelToday } from "@/lib/dates";
import { getRideGroups, searchRides } from "@/lib/rides";
import { TIME_WINDOWS, type RideKind, type TimeWindow } from "@/lib/ride-types";
import { firstNameOf } from "@/lib/format";
import { groupByRoute } from "@/lib/search-results";
import { isUuid } from "@/lib/validation/patterns";
import { SearchPanel } from "@/components/passenger/SearchPanel";
import { RideCard } from "@/components/passenger/RideCard";

type SearchParams = PageProps<"/">["searchParams"];

// Passenger home — ride search (SRS §4.1).
export default function FindRidePage({ searchParams }: PageProps<"/">) {
  return (
    <main className="page-content">
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
  const group = one("group");
  const date = one("date");
  const kind = one("kind");
  const time = one("time");
  return {
    groupId: isUuid(group) ? group : undefined,
    date: isIsoDate(date) && date >= (await israelToday()) ? date : undefined,
    kind: kind === "recurring" || kind === "one_time" ? (kind as RideKind) : undefined,
    time: time && time in TIME_WINDOWS ? (time as TimeWindow) : undefined,
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
  const filters = await readFilters(searchParams);
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
            <RideCard key={dates[0].route_id} rides={dates} />
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
