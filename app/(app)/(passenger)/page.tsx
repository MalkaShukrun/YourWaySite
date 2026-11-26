import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { greetingFor, isIsoDate, israelHour, israelToday } from "@/lib/utils/dates";
import { getRecentSearches, getRideGroups, searchRides } from "@/lib/rides/data";
import type { RideKind } from "@/lib/rides/types";
import { firstNameOf } from "@/lib/utils/format";
import { groupByRoute, groupIdsFrom, placePicksFrom, searchedGroups } from "@/lib/rides/search";
import { TIME_PATTERN } from "@/lib/validation/patterns";
import { SearchPanel } from "@/components/passenger/SearchPanel";
import { RideCard } from "@/components/passenger/RideCard";
import { RideAlertButton } from "@/components/passenger/RideAlertButton";
import { SearchResultsFrame, SearchTransitionProvider } from "@/components/passenger/SearchTransition";

type SearchParams = PageProps<"/">["searchParams"];

export const metadata: Metadata = { title: "חיפוש נסיעה" };

// Passenger home — ride search (SRS §4.1).
export default function FindRidePage({ searchParams }: PageProps<"/">) {
  return (
    <main className="page-content page-wide">
      <Suspense fallback={<div className="welcome"><div><p>&nbsp;</p><h1>בואי נמצא לך טרמפ</h1></div></div>}>
        <Welcome />
      </Suspense>
      <SearchTransitionProvider>
        <Suspense fallback={<section className="search-card search-placeholder" aria-busy="true" />}>
          <Search searchParams={searchParams} />
        </Suspense>
        <SearchResultsFrame>
          <Suspense fallback={<ResultsHead subtitle="טוען נסיעות…" />}>
            <Results searchParams={searchParams} />
          </Suspense>
        </SearchResultsFrame>
      </SearchTransitionProvider>
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
    origins: placePicksFrom(params.origin),
    destinations: placePicksFrom(params.destination),
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
  const today = await israelToday();
  const [groups, filters, recent] = await Promise.all([getRideGroups(), readFilters(searchParams), getRecentSearches(today)]);
  return <SearchPanel groups={groups} initial={filters} today={today} recent={recent} />;
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const [user, filters, groups, today] = await Promise.all([requireUser(), readFilters(searchParams), getRideGroups(), israelToday()]);
  // The groups between the picked places; when none is, there's nothing to search.
  const groupIds = searchedGroups(groups, filters);
  const rides = groupIds?.length === 0 ? [] : await searchRides({ ...filters, groupIds });
  const routes = groupByRoute(rides);

  // She can ask to hear about a ride (spec C10): with no results, from the
  // card that says so, filled from the search; with full rides, from each
  // full ride's own card (RideCard), filled from it.
  return (
    <>
      <ResultsHead subtitle={`${routes.length} תוצאות`} />
      {rides.length === 0 ? (
        <div className="panel empty-state">
          <strong>לא נמצאו נסיעות מתאימות</strong>
          <span>נסי לשנות את הסינון, או הגדירי התראה לנסיעה מתאימה.</span>
          <RideAlertButton groups={groups} initial={filters} today={today} />
        </div>
      ) : (
        <div className="trip-grid">
          {routes.map((dates) => (
            <RideCard key={dates[0].route_id} rides={dates} own={dates[0].driver_id === user.id} groups={groups} today={today} />
          ))}
        </div>
      )}
    </>
  );
}

function ResultsHead({ subtitle }: { subtitle: string }) {
  return (
    <div className="results-head">
      {/* Announced as the filters change the results. */}
      <div><span aria-live="polite">{subtitle}</span></div>
    </div>
  );
}
