"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { signOut } from "@/app/(auth)/login/actions";
import { useMode } from "./useMode";

// Top bar: role switch (SRS §7.1) + the signed-in user's menu.
export function Header({ userSlot }: { userSlot: ReactNode }) {
  const mode = useMode();
  return (
    <header className="topbar">
      <div className="mobile-logo"><Logo /></div>
      <div className="role-switch" role="group" aria-label="בחירת מצב">
        <Link href="/" className={mode === "passenger" ? "active" : ""}>אני הטרמפיסטית</Link>
        <Link href="/dashboard" className={mode === "driver" ? "active" : ""}>אני הנהגת</Link>
      </div>
      <div className="header-actions">{userSlot}</div>
    </header>
  );
}

export function UserMenu({ name, initials }: { name: string; initials: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="user-menu-wrap" ref={ref}>
      <button className="header-user" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="avatar avatar-sand">{initials}</div>
        <div>
          <strong>{name}</strong>
        </div>
      </button>
      {open && (
        <div className="user-menu">
          <form action={signOut}>
            <button type="submit" className="logout-item">
              <LogOut className="icon" size={16} strokeWidth={1.8} /> התנתקות
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
