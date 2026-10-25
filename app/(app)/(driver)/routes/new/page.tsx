import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { israelToday } from "@/lib/dates";
import { getRideGroups } from "@/lib/rides";
import { RouteEditor } from "@/components/driver/RouteEditor";

export default function NewRoutePage() {
  return (
    <main className="page-content">
      <Link className="back-link" href="/routes"><ArrowLeft className="icon" size={17} strokeWidth={1.8} /> חזרה למסלולים</Link>
      <Suspense fallback={<div className="editor-layout" aria-busy="true" />}>
        <Editor />
      </Suspense>
    </main>
  );
}

async function Editor() {
  await requireUser();
  const [groups, today] = await Promise.all([getRideGroups(), israelToday()]);
  return <RouteEditor groups={groups} route={null} today={today} />;
}
