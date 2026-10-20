import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "בדרך שלך",
  description: "ניהול טרמפים ונסיעות קבוצתיות — נוסעות יחד, מגיעות רחוק",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body>{children}</body>
    </html>
  );
}
