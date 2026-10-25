import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { israelToday } from "@/lib/dates";
import { getRideGroups } from "@/lib/rides";
import { getRouteForEdit } from "@/lib/driver";
import { RouteEditor } from "@/components/driver/RouteEditor";

const UUID = /^[0-9a-f-]{36}$/i;

// "Edit Route" (SRS §5.1).
export default function EditRoutePage({ params }: PageProps<"/routes/[id]">) {
  return (
    <main className="page-content">
      <Link className="back-link" href="/routes"><ArrowLeft className="icon" size={17} strokeWidth={1.8} /> חזרה למסלולים</Link>
      <Suspense fallback={<div className="editor-layout" aria-busy="true" />}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}

async function Editor({ params }: Pick<PageProps<"/routes/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [groups, route, today] = await Promise.all([getRideGroups(), getRouteForEdit(user.id, id), israelToday()]);
  if (!route) notFound();
  return <RouteEditor groups={groups} route={route} today={today} />;
}
