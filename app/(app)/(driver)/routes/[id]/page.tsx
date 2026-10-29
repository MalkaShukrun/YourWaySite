import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/session";
import { israelNow } from "@/lib/utils/dates";
import { getRideGroups } from "@/lib/rides/data";
import { getRouteForEdit, isPastOneTimeRide } from "@/lib/driver/data";
import { RouteEditor } from "@/components/driver/RouteEditor";
import { iconProps } from "@/components/ui/icon";
import { isUuid } from "@/lib/validation/patterns";

export const metadata: Metadata = { title: "עריכת מסלול" };

// Edit a published route (SRS §5.1): only its note and new stops — its other details are fixed.
export default function EditRoutePage({ params }: PageProps<"/routes/[id]">) {
  return (
    <main className="page-content">
      <Link className="back-link" href="/routes"><ArrowLeft {...iconProps} size={17} /> חזרה למסלולים</Link>
      <Suspense fallback={<div className="editor-layout" aria-busy="true" />}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}

async function Editor({ params }: Pick<PageProps<"/routes/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [groups, route, now] = await Promise.all([getRideGroups(), getRouteForEdit(user.id, id), israelNow()]);
  if (!route) notFound();
  if (route.ride_cancelled || isPastOneTimeRide(route, format(now, "yyyy-MM-dd HH:mm"))) redirect("/routes");
  const today = format(now, "yyyy-MM-dd");
  return <RouteEditor groups={groups} route={route} today={today} />;
}
