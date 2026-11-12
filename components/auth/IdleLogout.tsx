"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { signOutIdle } from "@/app/(auth)/login/actions";
import { ACTIVITY_PING_MS, IDLE_LOGIN_PATH, IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/lib/auth/idle";
import { iconProps } from "@/components/ui/icon";

// The last input, shared by every tab of the site: activity in one keeps them
// all signed in, and they all time out together.
const STORAGE_KEY = "yw-last-activity";
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;
// Input this soon after the last recorded time isn't written again.
const RECORD_EVERY_MS = 5_000;

function readShared() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(time: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(time));
  } catch {
    // Storage blocked: this tab keeps its own time.
  }
}

// Signs the user out after 10 minutes without input, with a minute's warning
// (spec A8). Time is measured by the clock, not by a single long timer, so a
// tab throttled in the background or a device waking from sleep catches up.
export function IdleLogout() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [leaving, startLeaving] = useTransition();
  const titleId = useId();
  const textId = useId();
  // This tab's last recorded input and ping, and whether it is signing out.
  const tracker = useRef({ own: 0, pinged: 0, signingOut: false });

  const record = useCallback((time: number) => {
    const t = tracker.current;
    if (time - t.own >= RECORD_EVERY_MS) {
      t.own = time;
      writeShared(time);
    }
    if (time - t.pinged >= ACTIVITY_PING_MS) {
      t.pinged = time;
      fetch("/auth/activity", { method: "POST", redirect: "manual", cache: "no-store" })
        .then((response) => {
          // The server already timed her out (e.g. the page was asleep).
          if (response.type === "opaqueredirect") window.location.assign(IDLE_LOGIN_PATH);
        })
        .catch(() => {
          t.pinged = 0; // tried again on the next input
        });
    }
  }, []);

  const leave = useCallback(() => {
    const t = tracker.current;
    if (t.signingOut) return;
    t.signingOut = true;
    startLeaving(async () => {
      try {
        await signOutIdle();
      } catch {
        t.signingOut = false; // offline: tried again on the next check
      }
    });
  }, []);

  useEffect(() => {
    const t = tracker.current;
    const idleFor = () => Date.now() - Math.max(readShared(), t.own);

    // Opening the page counts as activity, and its request already told the server.
    const opened = Date.now();
    t.own = opened;
    t.pinged = opened;
    writeShared(opened);

    const onActivity = () => {
      const now = Date.now();
      // Recorded a moment ago: pointermove fires many times a second.
      if (now - t.own < RECORD_EVERY_MS) return;
      // Past the warning only "stay" counts, not a mouse nudge as the device wakes.
      if (idleFor() < IDLE_WARNING_MS) record(now);
    };
    const check = () => {
      const idle = idleFor();
      if (idle >= IDLE_TIMEOUT_MS) leave();
      else if (idle >= IDLE_WARNING_MS) setSecondsLeft(Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
      else setSecondsLeft(null);
    };

    const options = { capture: true, passive: true };
    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, onActivity, options);
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 1000);
    return () => {
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, onActivity, options);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [record, leave]);

  if (secondsLeft === null) return null;

  const stay = () => {
    record(Date.now());
    setSecondsLeft(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card small-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId}>
        <span className="modal-icon"><Clock {...iconProps} size={22} /></span>
        <h2 id={titleId}>עדיין כאן?</h2>
        <p id={textId}>
          לא הייתה פעילות באתר כבר {IDLE_WARNING_MS / 60_000} דקות. מטעמי אבטחה ננתק אותך בעוד{" "}
          {secondsLeft === 1 ? "שנייה אחת" : `${secondsLeft} שניות`}.
        </p>
        <div className="idle-actions">
          <button type="button" className="btn btn-primary full-button" onClick={stay} disabled={leaving} autoFocus>
            כן, להישאר מחוברת
          </button>
          <button type="button" className="btn btn-ghost full-button" onClick={leave} disabled={leaving}>
            להתנתק עכשיו
          </button>
        </div>
      </div>
    </div>
  );
}
