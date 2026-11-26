"use client";

import Link from "next/link";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { DoorOpen } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Announcement } from "./Announcement";
import { ContactButton } from "@/components/contact/ContactButton";
import { signOut } from "@/app/(auth)/login/actions";
import { usePopover } from "@/components/ui/usePopover";
import { useMode } from "./useMode";
import { iconProps } from "@/components/ui/icon";

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
      <div className="header-actions"><Announcement mode={mode} compact /><ContactButton />{userSlot}</div>
    </header>
  );
}

export function UserMenu({ name, initials }: { name: string; initials: string }) {
  const { open, setOpen, ref } = usePopover();
  // A mouse opens the menu by hovering; it closes a moment after the mouse
  // leaves, so crossing the gap down to the menu doesn't shut it.
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressedWith = useRef("");
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const onEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  };
  // Touch and keyboard toggle it; a mouse click keeps the hovered menu open.
  const onClick = () => {
    const mouse = pressedWith.current === "mouse";
    pressedWith.current = "";
    setOpen((v) => mouse || !v);
  };

  return (
    <div className="user-menu-wrap" ref={ref} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        className="header-user"
        onPointerDown={(event) => (pressedWith.current = event.pointerType)}
        onClick={onClick}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="avatar avatar-sand">{initials}</div>
        <div>
          <strong>{name}</strong>
        </div>
      </button>
      {open && (
        <div className="user-menu">
          <form action={signOut}>
            <button type="submit" className="logout-item">
              <DoorOpen {...iconProps} size={17} /> התנתקות
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
