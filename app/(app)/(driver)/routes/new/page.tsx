import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/session";
import { israelNow } from "@/lib/utils/dates";
import { getRideGroups } from "@/lib/rides/data";
import { getRouteForEdit } from "@/lib/driver/data";
import { RouteEditor } from "@/components/driver/RouteEditor";
import { iconProps } from "@/components/ui/icon";
import { isUuid } from "@/lib/validation/patterns";

export const metadata: Metadata = { title: "מסלול חדש" };

// A new route, or with `?copy=<id>` a new one that starts from another of her
// routes — active, a ride that took place, or one cancelled for its date.
export default function NewRoutePage({ searchParams }: PageProps<"/routes/new">) {
  return (
    <main className="page-content">
      <Link className="back-link" href="/routes"><ArrowLeft {...iconProps} size={17} /> חזרה למסלולים</Link>
      <Suspense fallback={<div className="editor-layout" aria-busy="true" />}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Editor({ searchParams }: Pick<PageProps<"/routes/new">, "searchParams">) {
  const user = await requireUser();
  const { copy } = await searchParams;
  const [groups, now, copyFrom] = await Promise.all([
    getRideGroups(),
    israelNow(),
    typeof copy === "string" && isUuid(copy) ? getRouteForEdit(user.id, copy) : null,
  ]);
  // Next keeps this page's client state when only the query changes, and the
  // form reads its values once, so each source needs its own editor.
  return <RouteEditor key={copyFrom?.id ?? "new"} groups={groups} route={null} copyFrom={copyFrom} today={format(now, "yyyy-MM-dd")} />;
}
