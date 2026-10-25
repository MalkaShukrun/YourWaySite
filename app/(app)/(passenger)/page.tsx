import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { greetingFor, isIsoDate, israelHour, israelToday } from "@/lib/dates";
import { getRideGroups, searchRides } from "@/lib/rides";
import { TIME_WINDOWS, type RideKind, type TimeWindow } from "@/lib/ride-types";
import { SearchPanel } from "@/components/passenger/SearchPanel";
import { TripCard } from "@/components/passenger/TripCard";

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
      <Suspense fallback={<ResultsHead subtitle="טוענת נסיעות…" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;

async function readFilters(searchParams: SearchParams) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const group = one("group");
  const date = one("date");
  const kind = one("kind");
  const time = one("time");
  return {
    groupId: group && UUID.test(group) ? group : undefined,
    date: isIsoDate(date) && date >= (await israelToday()) ? date : undefined,
    kind: kind === "recurring" || kind === "one_time" ? (kind as RideKind) : undefined,
    time: time && time in TIME_WINDOWS ? (time as TimeWindow) : undefined,
  };
}

async function Welcome() {
  const user = await requireUser();
  const firstName = user.fullName.split(/\s+/)[0];
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
  const trips = await searchRides(filters);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <ResultsHead subtitle={filtered ? `${trips.length} תוצאות` : "נסיעות קרובות בשבוע הקרוב"} />
      {trips.length === 0 ? (
        <div className="panel empty-state">
          <strong>לא נמצאו נסיעות מתאימות</strong>
          <span>נסי לשנות את התאריך, השעה או המסלול.</span>
        </div>
      ) : (
        <div className="trip-grid">
          {trips.map((trip) => (
            <TripCard key={`${trip.route_id}-${trip.ride_date}`} trip={trip} />
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
