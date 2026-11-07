// Sends a batch of claimed emails: the daily ones (email.ts) and the ride
// emails (ride-emails.ts). Plain TypeScript, so the unit tests can run it.

type Deps<T> = {
  claim: () => Promise<T[]>;
  send: (email: T) => Promise<void>;
  release: (email: T) => Promise<void>;
  wait: () => Promise<void>;
  label: (email: T) => string; // Who it was for, in the log of a failed send.
};

// One at a time so Gmail doesn't see a burst. A failed send is released, so
// the next run tries it again.
export async function sendEmails<T>({ claim, send, release, wait, label }: Deps<T>) {
  const emails = await claim();
  let sent = 0;
  for (const [index, email] of emails.entries()) {
    if (index > 0) await wait();
    try {
      await send(email);
      sent += 1;
    } catch (error) {
      console.error("daily-passenger-email: send failed", label(email), error);
      await release(email);
    }
  }
  return { sent, failed: emails.length - sent };
}
