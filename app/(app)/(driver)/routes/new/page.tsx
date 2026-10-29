import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { israelToday } from "@/lib/utils/dates";
import { getRideGroups } from "@/lib/rides/data";
import { RouteEditor } from "@/components/driver/RouteEditor";
import { iconProps } from "@/components/ui/icon";

export const metadata: Metadata = { title: "מסלול חדש" };

export default function NewRoutePage() {
  return (
    <main className="page-content">
      <Link className="back-link" href="/routes"><ArrowLeft {...iconProps} size={17} /> חזרה למסלולים</Link>
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
