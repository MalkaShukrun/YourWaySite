import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { israelToday } from "@/lib/dates";
import { getRideGroups } from "@/lib/rides";
import { getRouteForEdit } from "@/lib/driver";
import { RouteEditor } from "@/components/driver/RouteEditor";
import { iconProps } from "@/components/ui/icon";
import { isUuid } from "@/lib/validation/patterns";

// "Edit Route" (SRS §5.1).
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

  const [groups, route, today] = await Promise.all([getRideGroups(), getRouteForEdit(user.id, id), israelToday()]);
  if (!route) notFound();
  return <RouteEditor groups={groups} route={route} today={today} />;
}
