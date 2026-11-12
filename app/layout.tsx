import type { Metadata } from "next";
import { SITE_ORIGIN } from "@/lib/site/url";
import { assistantVariables } from "./fonts/assistant";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: "בדרך שלך", template: "%s · בדרך שלך" },
  description: "ניהול טרמפים ונסיעות קבוצתיות — נוסעות יחד, מגיעות רחוק",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={assistantVariables}>
      <body>{children}</body>
    </html>
  );
}
