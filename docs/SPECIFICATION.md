# YourWay — System specification

*How the ride-sharing app behaves today, written from the code: every rule the screens and the database enforce, and what the driver and the passenger each see in each situation.*

- **Source:** the `YourWaySite` code and database migrations 0001–0040
- **As of:** 5 November 2026
- **Interface language:** Hebrew; labels below are quoted as they appear on screen

**Contents**

1. [Overview](#1-overview)
2. [Core concepts and rules](#2-core-concepts-and-rules)
3. [Screens and where things appear](#3-screens-and-where-things-appear)
4. [Scenarios](#4-scenarios) (38): [A. Accounts and access](#a-accounts-and-access) · [B. Publishing routes](#b-publishing-routes) · [C. Finding and booking a ride](#c-finding-and-booking-a-ride) · [D. The driver's day](#d-the-drivers-day) · [E. A passenger cancels](#e-a-passenger-cancels) · [F. Removing routes](#f-removing-routes) · [G. After the ride](#g-after-the-ride) · [H. Admin: ride groups](#h-admin-ride-groups) · [I. Support and errors](#i-support-and-errors)
5. [Who sees what](#5-who-sees-what)
6. [Booking and ride states](#6-booking-and-ride-states)
7. [Messages reference](#7-messages-reference)
8. [Not in the system](#8-not-in-the-system)

## 1. Overview

YourWay connects women who drive regular or one-off trips with women looking for a ride on the same route. Drivers publish routes with their own pickup and drop-off stops. Passengers search, pick a date and stops, and book a seat in one click. Payment happens outside the app; each passenger keeps her own record of what she paid.

### Who uses it

| Role | What she does | Home screen after sign-in |
|---|---|---|
| **Passenger** | Searches rides, books seats, cancels, tracks payments. | Ride search, `/` |
| **Driver** | Publishes routes, sees each day's passengers, cancels a date, adds passengers by hand. | Same account; switches to driver mode |
| **Admin** | Everything above, plus creating and managing ride groups (origin → destination pairs) and the list of places they go between, giving out personal sign-in codes and seeing the site-wide totals. | Group management, `/admin/groups` |

There is one account type. Any signed-in user can act as a passenger or as a driver. Being an admin is a flag on the profile; it is set in the database for the owner's account and can't be set from the app.

### Modes

The interface has a passenger mode and a driver mode, each with its own menu. Opening a driver page (`/dashboard`, `/routes`) switches to driver mode; opening a passenger page switches back. The profile and group pages belong to both, and keep whichever mode was used last. That last mode is remembered in the browser, not on the account.

| Mode | Menu items |
|---|---|
| Passenger | “מציאת נסיעה” (search) · “הנסיעות שלי” (my rides) · “מעקב תשלומים” (payments) |
| Driver | “לוח נהגת שבועי” (weekly dashboard) · “המסלולים שלי” (my routes) |
| Both | “הפרופיל שלי” (profile) · “ניהול קבוצות” (admins only) |

On phones the menu becomes a bottom tab bar with short labels.

At the bottom of the menu, a card announces the daily passenger email: “**חדש!** קבלי התראות במייל על הטרמפיסטיות שלך, בתזמון שאפשר להתאים בפרופיל.” It opens the profile. On phones, where the menu is a tab bar, it is a pulsing bell in the top bar instead.

## 2. Core concepts and rules

### Ride groups

A ride group is an origin–destination pair, such as “בית שמש, רמה ג ← ירושלים, הר חוצבים”. Both ends come from one list of places that admins keep; each place is a city and a neighborhood or area inside it (migrations 0038–0040). A card that shows one place at a time (search results, the ride page, admin's place list) shows its city with its neighborhood on the line under it; a route (“origin ← destination”, on ride cards and rows) shows each place on one line as “city, **neighborhood**”; dropdowns show “city, neighborhood”. The neighborhood is always in bold. Only admins create groups. Every route belongs to one group, and passengers search by the places at either end (C1). Each known city has a map area, and some places a smaller one of their own, so a driver marking stops on the map can't place a pin far outside the route's region.

### Routes

- **Recurring route** (“מסלול קבוע”): runs on chosen weekdays, Sunday to Friday, from a start date onward.
- **One-time ride** (“נסיעה חד־פעמית”): runs on a single date, which can be any day including Saturday.
- Each route has a departure time, 1–8 seats, a price per passenger (up to 4 digits, 2 decimals), an optional note of up to 200 characters, and at least one pickup stop and one drop-off stop.
- Stop names are 2–60 characters. Marking a stop on the map is optional; a stop can have just a name.
- **A route nobody has booked can be edited in full** — its group, type, days, date, time, seats, price, note and stops (rename, move, remove, add).
- **A booked route can't be edited.** Once any passenger has booked it — on any date, past or future, including a booking later cancelled — its group, days, date, time, seats, price and existing stops are fixed. The only changes allowed are adding more stops and editing the note. To change anything else, the driver duplicates the ride (F2), changes the copy, and then removes the original route.
- A removed route can't be restored.

### Rides and dates

A ride is one route on one date. A recurring route produces a ride on each of its weekdays. All times are Israel time (Asia/Jerusalem); a ride's departure is its date plus the route's time. Once that moment passes, the ride has **departed**, and several things change: it leaves search, it can no longer be booked or cancelled, and it moves to history.

> Per-date departure times are gone. A ride always leaves at its route's time. Times that drivers changed for a single date before this was removed were cleared by migration 0025.

### Bookings

- A booking is one passenger, one ride (route and date), one pickup stop and one drop-off stop.
- A passenger can book several dates of a recurring route at once, with the same stops on each.
- Bookings stop exactly at the seat limit. There's no waiting list and no overbooking.
- A passenger can't book the same ride twice, and a driver can't book her own ride.
- A booking keeps the route's price at the time it was made.
- A booking is either **active** or **cancelled**. There's no late-cancellation status (removed by migration 0026).
- **Guest bookings:** a driver can add a passenger by hand with a name, a phone and stops. The booking holds those details only, is never linked to any account, and only the driver sees it.

### Cancellation by date

A driver can cancel a single date of a route (“ביטול הנסיעה לתאריך זה בלבד”) until that ride departs. The rest of the schedule is untouched. A cancelled date can't be restored. Bookings on that date stay on record but are shown as cancelled by the driver, and are never charged.

### Charges

Nothing is processed in the app. A booking counts as a charge in the passenger's payments only when all of these hold: the booking is still active, the driver didn't cancel that date, and the ride has departed. Each passenger marks her own rides as paid or unpaid; the driver never sees these marks.

### Ride lifecycle

Published → Open for booking → Full (optional) → Departed → History and payments

Open for booking → Cancelled for this date → Shown as cancelled · never charged

## 3. Screens and where things appear

*Every page except sign-in, the terms of use and the privacy policy requires a signed-in user with a completed profile. Signed-out visitors are sent to sign-in.*

| Screen | Address | Who | What it shows |
|---|---|---|---|
| Sign-in | `/login` | Anyone | Google sign-in, or a personal code for approved addresses (A6), consent to the terms of use and the privacy policy, site totals (members, and shown groups with at least one ride that wasn't cancelled and hasn't taken place; refreshed hourly). Opens the onboarding window for new users. |
| Terms of use | `/terms` | Anyone | The terms text, including the cancellation policy. |
| Privacy policy | `/privacy` | Anyone | The policy text, including the mailing and messages section. |
| Ride search | `/` | All | Greeting, filter bar (“מאיפה” and “לאן” with a swap button, date, departure from/until, ride type), result cards for the next 7 days. Each recurring route appears as one card with a chip per date showing free seats. |
| Ride details and booking | `/ride/[id]?date=` | All | Day picker (recurring), pickup and drop-off choice, price total, booking button, route map, driver card (contact details only after booking), vehicle, note. |
| My rides | `/my-rides` | Passenger | Tabs “נסיעות קרובות” (upcoming) and “היסטוריה” (past, newest first). Each row: time, date, route, price, stops, driver contact, cancel button, and “הנהגת ביטלה את הנסיעה” when the driver cancelled. |
| Payments | `/payments` | Passenger | Month picker (this month and the 3 before), totals for the month (total, paid, left to pay), one row per charged ride with a paid/unpaid toggle, and an all-time unpaid balance per driver. |
| Weekly dashboard | `/dashboard?date=` | Driver | Week (Sunday–Saturday) containing the chosen date. Totals for the week; one folding section per day that has rides; one card per ride with its passengers and contact details, the day's stops, a map, cancel-for-date and add-passenger controls. |
| My routes | `/routes` | Driver | Tabs “מסלולים פעילים” (active), “היסטוריה” (one-time rides that departed) and “מסלולים מבוטלים” (one-time rides cancelled for their date). Every card has “שכפול נסיעה” (F2, F3). |
| New route | `/routes/new` | Driver | Route editor: group (with a search box), type, days or date, time, seats, price, note, stops, map. With `?copy=[id]`, “שכפול נסיעה”: the same editor filled from another of her routes (F2). Reached from “הוספת מסלול” on the dashboard. |
| Edit route | `/routes/[id]` | Driver | Same editor. Fully editable while nobody has booked the route; once booked, everything is locked except the note and adding new stops. |
| Profile | `/profile` | All | Name, phone, email (read-only, from her sign-in), optional vehicle (model, colour, seats), and the daily passenger email (D7). Admins also see group management here. |
| Group management | `/admin/groups` | Admin | Site-wide totals (H5). Groups with how many active routes each has; add, change places, hide/show, delete. The list of places (H6). Personal-code addresses (H4). The group, place and address lists fold away under their titles; “קבוצה חדשה” and “מקום חדש” sit at the end of their list's title row and work while it's folded. |
| Not found | any unknown address | Anyone | “הדף לא נמצא”, with a link home. |

## 4. Scenarios

*Each scenario states what starts it, then what happens for the driver, for the passenger, and where the result appears. Rules and edge cases follow each one.*

### A. Accounts and access

#### A1. A new user signs in for the first time

**Trigger:** She ticks the consent to the terms of use and the privacy policy, and signs in with Google.

**Driver side**

Same flow; there is no separate driver sign-up.

**Passenger side**

- Google returns her to the app and a profile is created automatically, with her Google name and email.
- The onboarding window asks for her full name (editable) and phone (required). Vehicle details are optional.
- After saving she lands on ride search (admins on group management).

**Where it shows**

Onboarding window on `/login`. Afterwards the name and phone are on “הפרופיל שלי”.

**Rules:** until a phone is saved, every signed-in page sends her back to onboarding. Phone format is Israeli (e.g. 050-000-0000). Names are 2–60 characters; a Google name longer than 60 is cut to 60. If Google sign-in fails, the reason is shown on the sign-in page.

#### A2. A signed-out visitor opens any app page

**Trigger:** For example a shared link to a ride, or an expired session.

**Driver side**

Nothing; no data is read.

**Passenger side**

She is sent to sign-in. After signing in she lands on her home screen, not the link she opened.

**Where it shows**

`/login`. Only sign-in, the terms of use, the privacy policy and the not-found page are open to visitors.

#### A3. A user edits her profile

**Trigger:** She changes her name, phone or vehicle on “הפרופיל שלי”.

**Driver side**

- If she is a driver, her new name appears on her ride cards and ride pages right away.
- Her new phone is what booked passengers see.
- Her vehicle model and colour show on her ride pages.

**Passenger side**

Her drivers see her new name and phone on their dashboards.

**Where it shows**

Profile, ride cards, ride page driver card, driver dashboard passenger rows.

**Rules:** the email can't be edited; it always comes from her sign-in. Vehicle details are all-or-nothing: once she adds a car, model, colour and 1–8 seats are required. Having a vehicle is not required to publish routes.

#### A4. A user switches between passenger and driver mode

**Trigger:** She uses the mode toggle in the top bar, or opens a page of the other mode.

**Driver side**

Driver menu: weekly dashboard and my routes.

**Passenger side**

Passenger menu: search, my rides, payments.

**Where it shows**

Sidebar on desktop, bottom tab bar on phones. Profile and group pages keep the last mode, remembered in this browser only.

#### A5. A user signs out

**Trigger:** She chooses sign-out from the user menu.

**Driver side**

Her routes and bookings are untouched.

**Passenger side**

Her session cookies are removed, even if Google already ended the session, and she returns to sign-in.

**Where it shows**

`/login`.

#### A6. A user without Google signs in with a personal code

**Trigger:** An admin added her address and gave her the code (H4). She opens “אין לך חשבון Google? כניסה עם קוד אישי”, ticks the consent and enters her email and code.

**Passenger side**

- She is signed in. The first time, the onboarding window asks for her name and phone, as in A1.
- The same code works every time.
- If she forgot it, “שכחת את הקוד? שלחי לנו מייל” copies the support address and shows it. The contact form needs a signed-in user, so it can't help here.

**Where it shows**

`/login`, under the Google button.

**Rules:** the code is 8 digits and permanent, like a password. Any wrong address or code shows “המייל או הקוד שגויים.”, so the page doesn't show who is approved. An address gets 10 attempts an hour. An approved address that also has Google can use either way in, and both reach the same account.

### B. Publishing routes

#### B1. A driver publishes a recurring route

**Trigger:** On “מסלול חדש” she picks a group, “מסלול קבוע”, weekdays, a start date, time, seats, price, an optional note, and adds stops.

**Driver side**

- She is taken to my routes with “המסלול נשמר ופורסם”.
- The route appears under “מסלולים פעילים”, newest first.
- Each of its dates appears on the weekly dashboard.

**Passenger side**

- From the start date, each weekday appears in search within the 7-day window.
- One card per route, with a chip per date showing free seats.

**Where it shows**

Driver: `/routes`, `/dashboard`. Passenger: `/`, `/ride/[id]`. Also counted in the sign-in page's active-routes total.

**Rules:** at least one weekday (Sunday–Friday); the start date can't be in the past; at least one pickup and one drop-off stop; 1–8 seats. The same driver also sees her route in search, marked as hers (B6).

#### B2. A driver publishes a one-time ride

**Trigger:** Same editor, with “נסיעה חד־פעמית” and a single date.

**Driver side**

Listed under “מסלולים פעילים” until it departs, then under “היסטוריה”. Shown on the dashboard on its date.

**Passenger side**

Appears in search once its date is within the next 7 days (or when she searches that date), until departure.

**Where it shows**

`/routes`, `/dashboard`, `/`, `/ride/[id]`.

**Rules:** the date can't be in the past; it may fall on Saturday.

#### B3. A driver marks stops on the map, or skips the map

**Trigger:** For each stop she can name it only, or also place a pin.

**Driver side**

Pins can only be placed inside the group's map area. Unplaced stops are still valid.

**Passenger side**

The ride page lists all stops by name. The map shows only stops with pins, and only when at least one exists; the chosen pickup and drop-off are highlighted.

**Where it shows**

Ride page map; driver's dashboard map on each ride card.

#### B4. A driver wants to change a published route

**Trigger:** She opens “עריכת מסלול” on an active route.

**Driver side**

- **Nobody has booked the route** (no booking on any date, past or future, cancelled ones included): the note above the form reads “עדיין לא נרשמו טרמפיסטיות למסלול, ולכן אפשר לשנות את כל הפרטים…”. Every field is editable — group, type, days, date, time, seats, price, note — and saved stops can be renamed, moved on the map or removed, like in a new route. If its group was hidden since, the first visible group is selected instead. Saving updates the same route.
- **A passenger has booked it:** the note reads “כבר נרשמו טרמפיסטיות למסלול, ולכן אי אפשר לשנות אותו…”, and everything is locked except the note and adding new stops. Locked fields, and the saved stops, are shown faded with a not-allowed cursor; saved stops have no map or remove buttons.
  - She can change the note (up to 200 characters) or clear it.
  - Saving new stops adds them after the existing ones.
  - To change days, time, seats or price, the note tells her to duplicate the ride (“שכפלי את הנסיעה ושני בה את מה שצריך, ואחר כך הסירי את המסלול הזה”) — duplicating first, because a removed route can't be copied.
- If a passenger books while she has the full editor open, saving is refused with `ROUTE_LOCKED`.

**Passenger side**

A route nobody has booked has no one to affect. Booked passengers keep exactly what they booked. New stops become available for new bookings. The updated note shows on the ride page for everyone, including passengers who already booked.

**Where it shows**

`/routes/[id]`; new stops and the note on the ride page; new stops on the dashboard.

**Rules:** enforced in the database too (`ROUTE_LOCKED`: “כבר נרשמו טרמפיסטיות למסלול, ולכן אי אפשר לשנות אותו — אפשר רק לערוך את ההערה ולהוסיף תחנות.”). Passengers aren't notified when the note changes. Not available for a one-time ride that has departed or was cancelled; opening its address returns to my routes.

#### B5. A driver's form has a problem

**Trigger:** She saves with a missing day, date, stop, or an invalid price or seat count.

**Driver side**

The field shows the problem (e.g. “יש לבחור לפחות יום אחד”, “יש להוסיף לפחות תחנת איסוף אחת”, “בין 1 ל־8 מקומות”, “מחיר לא תקין”). A stop without a name shows “יש לתת שם לכל תחנה”; a one-letter name shows “שם התחנה צריך להכיל לפחות 2 תווים”. Nothing is saved.

**Passenger side**

Nothing changes.

**Where it shows**

Inline in the route editor.

#### B6. A driver looks at her own ride as passengers see it

**Trigger:** She searches in passenger mode and finds her own route.

**Driver side**

- Her card says “הנסיעה שלך” and its button is “צפייה בנסיעה”.
- The ride page shows everything but can't be booked: “זו הנסיעה שלך · כך רואות אותה הטרמפיסטיות”, with a link to my routes.

**Passenger side**

Not applicable.

**Where it shows**

`/` and `/ride/[id]`.

**Rules:** the database also refuses it (`OWN_RIDE`).

### C. Finding and booking a ride

#### C1. A passenger searches

**Trigger:** She opens “מציאת נסיעה”, optionally filters, and presses “חיפוש נסיעה”.

**Driver side**

Nothing; searches aren't recorded.

**Passenger side**

- Without a date: rides from today through the next 6 days. With a date: that day only.
- Filters: “מאיפה” (from) and “לאן” (to), each one or more cities or places — a whole city (“בית שמש (כל העיר)”) covers every place in it; rides are found only in the direction picked, and “החלפת כיוון” swaps the two for the ride back. The list shows each city's whole-city option with its places indented under it by neighborhood only (“רמה ג”); while she types, matches show in full (“בית שמש, רמה ג”), since their city may be filtered out. Also ride type, and departure from and until (inclusive). An older link with `?group=` still narrows to those groups.
- Results are sorted by date then time; each route is one card. The heading shows how many were found (“N תוצאות”), with or without filters.
- No results, including picks with no group between them: “לא נמצאו נסיעות מתאימות”, with “נסי לשנות את המקומות, התאריך או השעה.”
- The ⓘ beside “מאיפה” reads “נהגת? להוספת מסלולי נסיעה מעיר לעיר יש ליצור קשר”.

**Where it shows**

`/`; the filters are kept in the address, so the search can be shared or reloaded. “חזרה לכל הנסיעות” on a ride page returns to the last search in that browser tab, with its filters.

**Rules:** search never lists rides that departed, dates the driver cancelled, removed routes, or routes in hidden groups (which also can't be booked by link, H2). A past date in the address is ignored. "From" later than "until" is swapped. Full dates still appear, with a “מלאה” chip.

#### C2. A passenger opens a ride before booking

**Trigger:** She clicks “לפרטים והרשמה” or a date chip.

**Driver side**

Nothing.

**Passenger side**

- She sees the driver's name, vehicle, route, date, time, free seats, note, stops and map.
- The driver's phone and email are hidden: “הטלפון והדוא״ל של הנהגת יוצגו אחרי ההרשמה לנסיעה.”
- The first pickup and drop-off are pre-selected; the price total updates with the number of dates.

**Where it shows**

`/ride/[id]?date=`.

#### C3. A passenger books one date

**Trigger:** She chooses stops and presses “אישור הרשמה לנסיעה”.

**Driver side**

- The passenger appears on that day's ride card with her name, phone, email and stops.
- The ride's free seats go down; the week's booked count goes up.
- No notification is sent.

**Passenger side**

- She is taken to my rides with “הנסיעה נוספה בהצלחה לנסיעות שלי”.
- The driver's phone and email now show on the ride page and in my rides.
- The ride page now says “את רשומה לנסיעה”.

**Where it shows**

Passenger: `/my-rides` upcoming tab. Driver: `/dashboard` ride card, stops box (“התחנות של היום”) and map.

**Rules:** the database checks, in order: the route runs that day and is active; it's not her own ride; the date isn't cancelled and hasn't departed; both stops belong to the route and are active; she isn't already booked; a seat is free.

#### C4. A passenger books several dates of a recurring route

**Trigger:** Under “בחרי ימים” she marks several dates and presses “אישור הרשמה ל־N ימים”.

**Driver side**

She appears on each booked date's ride card.

**Passenger side**

- All succeed: same as C3.
- Some fail: she stays on the page with “נרשמת ל־X מתוך N הימים. לא נרשמת ל: …”, listing each failed date and why. The successful dates are booked.
- All fail: the reasons are listed and nothing is booked.

**Where it shows**

Ride page message; my rides for the booked dates.

**Rules:** the same stops apply to every chosen date; up to 6 dates per request (the ride days in the 7-day window, Sunday–Friday). Dates she's already booked show “רשומה” and can't be chosen; full dates show “מלאה”.

#### C5. Two passengers try to take the last seat at the same moment

**Trigger:** Both press book on a ride with one free seat.

**Driver side**

Exactly one passenger appears; the ride shows as full.

**Passenger side**

The first is booked. The second sees “הנסיעה התמלאה — אין יותר מקומות פנויים.”

**Where it shows**

Ride page error for the second passenger.

**Rules:** bookings on a route are handled one at a time, so the seat limit can't be exceeded.

#### C6. A passenger can't book: full, already booked, unavailable

**Trigger:** She opens a ride that is full, that she already booked, or that was cancelled, removed or departed.

**Driver side**

Nothing changes.

**Passenger side**

- Full: “הנסיעה מלאה” on the button; the search card shows “אין מקום” when every date is full.
- Already booked: “את רשומה לנסיעה” with a link to my rides.
- Cancelled, removed or departed: “הנסיעה אינה זמינה”.
- If it changed while the page was open, pressing book shows “הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).”

**Where it shows**

Ride page button and message.

#### C7. A passenger opens a ride address that doesn't exist

**Trigger:** A mistyped or invalid route id or date in the address.

**Driver side**

Nothing.

**Passenger side**

The not-found page: “הדף לא נמצא”.

**Where it shows**

Not-found page.

### D. The driver's day

#### D1. A driver opens her weekly dashboard

**Trigger:** She opens “לוח נהגת שבועי”, optionally picking another week.

**Driver side**

- The week runs Sunday to Saturday. Only days with rides are listed.
- Totals: “טרמפיסטיות רשומות לשבוע הקרוב” (booked passengers) and rides this week (cancelled dates excluded).
- Today's rides start open; otherwise the chosen date or the first ride day.
- Today is marked “היום”. Once all of today's rides that weren't cancelled have left, today also shows “שעת היציאה עברה”.
- No rides: “אין לך נסיעות בשבוע הזה”.

**Passenger side**

Not applicable.

**Where it shows**

`/dashboard`. Each ride card:

- A gray header: the departure time in large type, the route, and two chips — the ride type and “N מתוך M מקומות” (lime when full). The fold arrow is at the far end; on phones the cancel button goes on the line under the route.
- “טרמפיסטיות רשומות ופרטי קשר”: one row per passenger with her name and, under it, “איסוף: … · הורדה: …” (plus “נוספה על ידך” for a guest, D4). Her phone and email are shown as buttons, each with its icon and the number or address, that call or write to her (a guest has no email); on phones they go on the line under her name. “הוספת טרמפיסטית” is the last row of the list.
- “התחנות של היום”: one line of the booked stops in route order, pickups then drop-offs, each with who gets on or off there, and the איסוף / הורדה legend. The map beside it has no legend of its own; it shows its own only when no one has booked yet.

**Rules:** removed routes don't appear. Cancelled dates still appear, marked “בוטלה לתאריך זה”.

#### D2. A driver cancels one date before it leaves

**Trigger:** She presses “ביטול הנסיעה לתאריך זה בלבד” and confirms “לבטל את הנסיעה? אי אפשר להחזיר אותה.”

**Driver side**

- The card shows “בוטלה לתאריך זה”, with no other message; cancel and add-passenger controls disappear.
- Other dates of the route are unchanged.
- A one-time ride moves to “מסלולים מבוטלים” in my routes.

**Passenger side**

- Booked passengers see “הנהגת ביטלה את הנסיעה” on the ride in my rides, and can no longer cancel it themselves.
- The date disappears from search and can't be booked.
- It is never charged in payments.
- No notification is sent; she finds out in my rides.

**Where it shows**

Driver: dashboard card, my routes (one-time). Passenger: `/my-rides` upcoming, then history after the original departure time.

**Rules:** can't be undone (`RIDE_CANCELLED`). The driver's contact details stay visible to the passengers who were booked.

#### D3. A driver tries to cancel a ride that already left

**Trigger:** The departure time has passed.

**Driver side**

The cancel button no longer shows on that card. If a page left open still offers it, the attempt is refused with “הנסיעה כבר יצאה ולא ניתן לבטל אותה.”

**Passenger side**

Nothing changes; the ride counts as taken place.

**Where it shows**

Dashboard card.

#### D4. A driver adds a passenger by hand

**Trigger:** On a ride card she presses “הוספת טרמפיסטית” and enters a name, phone, pickup and drop-off.

**Driver side**

- The passenger appears on the card with “נוספה על ידך” and the phone she entered.
- She takes a seat like any booking.
- Only this driver ever sees her.

**Passenger side**

- The added person isn't connected to any account, even one with the same phone; nothing appears in anyone's my rides or payments.
- Other passengers see one seat fewer.

**Where it shows**

Driver dashboard only.

**Rules:** name 2–60 characters, Israeli phone. The form is offered only when the date isn't cancelled and seats remain. Allowed after departure, to record who rode. Refused when: the phone is the driver's own (“אי אפשר להוסיף את עצמך כטרמפיסטית.”); a passenger who booked herself on this ride has that phone (“הטרמפיסטית כבר רשומה לנסיעה הזו.”); the ride is full (“אין מקומות פנויים בנסיעה הזו.”); the date is cancelled or the route doesn't run that day.

#### D5. A driver adds the same guest phone again

**Trigger:** She adds a phone that already has a guest seat on the same ride and date.

**Driver side**

- Before anything is saved, the form asks in place of its buttons: “כבר יש הרשמה עם מספר הטלפון הזה (‎<existing name>‎). להחליף אותה?” with “כן, להחליף” and “ביטול”.
- “כן, להחליף”: the earlier guest booking is replaced: the new name and stops take its seat. No extra seat is used. A toast says “ההרשמה של ‎<new name>‎ עודכנה”.
- “ביטול”: nothing is saved; the form stays open with what she typed. Changing any field also drops the question.

**Passenger side**

No effect on anyone else.

**Where it shows**

Dashboard ride card.

**Rules:** phones match by digits only (050-123-4567 equals 0501234567). The database refuses to replace without the driver's confirmation (`GUEST_EXISTS`, migration 0029), so a form left open on an old page can't overwrite a booking. Like any add, the form is offered only while seats remain: on a full ride she removes the guest and adds her again.

#### D6. A driver removes a passenger

**Trigger:** She opens a passenger row on a ride card.

**Driver side**

- Passengers she added by hand have a remove button; removing frees the seat.
- Passengers who booked themselves can't be removed by the driver. She can call or email them, and they cancel themselves.

**Passenger side**

Self-booked passengers are never removed by the driver.

**Where it shows**

Dashboard ride card.

#### D7. A driver gets tomorrow's passengers by email

**Trigger:** Under “מייל יומי לנהגות” on “הפרופיל שלי” she presses the button that shows the current state (“כבוי” or “פעיל”) to switch it, picks a time in 5-minute steps and presses “שמירת הגדרות המייל”. It is off until she turns it on; the suggested time is 20:00, Israel time.

**Driver side**

- Up to about 5 minutes after her time she gets one email, at her sign-in address, listing tomorrow's rides by departure time. For each ride: every active passenger's name, phone, email and boarding stop, ordered by stop, including passengers she added herself.
- If her time already passed today when she saves it, the email goes out on the next run.
- She can change the time or turn the email off at any time; a date's daily email is never sent twice (update emails, below, come on top of it).
- With “מייל עדכון על נוסעת חדשה” on (a second switch, shown while the daily email is on, off until she turns it on): when a passenger books a ride of that date after the daily email went out, she gets another email within about 5 minutes. Its subject starts with “עדכון:”, and it has the full updated list with the new passengers marked “(חדשה)”. Several bookings between two runs come in one email.

**Passenger side**

Nothing changes. A passenger the driver added shows the name and phone the driver entered, and no email (as on the dashboard, D4).

**Where it shows**

Profile; the driver's mailbox.

**Rules:** every user sees the setting; only a driver with passengers gets an email. No email if she has no passengers tomorrow: a ride with none is left out, and so is a cancelled date. The list is a snapshot of the moment it was sent. Only a new booking by a passenger sends an update: a passenger the driver added, a cancellation or a cancelled date doesn't. Updates for a date continue, for rides that haven't left yet, until her daily email for the next date is sent (at her time on the ride day itself); while her daily email waits for a retry, the retry carries the new passengers instead. A failed send is tried again every 5 minutes, for the same ride date, until the end of that date; a retry that goes out on the ride day itself says “להיום” and lists only the rides that haven't left yet.

### E. A passenger cancels

#### E1. A passenger cancels before departure

**Trigger:** In “נסיעות קרובות” she presses “ביטול”, at any time before the ride leaves.

**Driver side**

- The passenger disappears from that ride card; the seat is free again.
- No notification is sent.

**Passenger side**

- “ההרשמה בוטלה והמקום התפנה”.
- The ride leaves my rides and is never charged.
- She no longer sees the driver's phone and email for it.

**Where it shows**

Passenger: notice on `/my-rides`. Driver: `/dashboard`. Search: the seat shows as free again.

**Rules:** one click, no confirmation. Every cancellation is treated the same, however close to departure. There is no late-cancellation notice or charge.

#### E2. A passenger tries to cancel after departure

**Trigger:** The departure time has passed.

**Driver side**

Nothing changes.

**Passenger side**

The ride has moved to “היסטוריה”, which has no cancel button. If a page left open still offers it: “הנסיעה כבר יצאה ולא ניתן לבטל אותה.”

**Where it shows**

`/my-rides`.

#### E3. A passenger wants to cancel a ride the driver already cancelled

**Trigger:** The ride shows “הנהגת ביטלה את הנסיעה”.

**Driver side**

Nothing.

**Passenger side**

No cancel button is shown; there's nothing to cancel and nothing is charged.

**Where it shows**

`/my-rides`.

### F. Removing routes

#### F1. A driver removes a route that has upcoming bookings

**Trigger:** On an active route she presses “הסרת המסלול”, reads the warning to check for and tell booked passengers, and confirms.

**Driver side**

- The route disappears from my routes and from the dashboard.
- It can't be restored.

**Passenger side**

- Every upcoming booked date is marked as cancelled by the driver: “הנהגת ביטלה את הנסיעה” in my rides.
- Those dates are never charged.
- The route leaves search.

**Where it shows**

Passenger: `/my-rides`. Rides that already departed stay as they were, in history and payments.

#### F2. A driver tries to remove a one-time ride that already took place

**Trigger:** Its date and departure time have passed.

**Driver side**

It sits under “היסטוריה” with no way to remove or edit it. A direct attempt is refused with “הנסיעה כבר התקיימה ונשמרת בהיסטוריה — אי אפשר להסיר אותה.”

Its only action is “שכפול נסיעה”: `/routes/new?copy=[id]` opens the new-route editor filled with its details and stops. All of them can be changed, including the group and the ride type, and the date starts empty. If its group was hidden since, the first visible group is selected instead. Saving publishes a new route under the B1/B2 rules; the original ride stays in history unchanged.

Active routes, recurring and one-time, have the same “שכפול נסיעה” action next to their edit link. The copy is a separate new route; the original stays active and unchanged. Cancelled rides can be copied too (F3).

**Passenger side**

Her history and payments for that ride are kept.

**Where it shows**

`/routes?tab=history`, newest ride first.

#### F3. A one-time ride is cancelled for its date

**Trigger:** After D2 on a one-time ride.

**Driver side**

It moves to “מסלולים מבוטלים”, newest date first, with no remove or add-stops buttons, and stays there after its date. Its only action is “שכפול נסיעה”, as in F2: it opens the new-route editor filled with its details, and saving publishes a new route; the cancelled ride stays cancelled.

**Passenger side**

As in D2.

**Where it shows**

`/routes?tab=cancelled`.

**Note:** hiding the buttons is done in the page only; the database doesn't block removing a cancelled ride.

### G. After the ride

#### G1. A ride reaches its departure time

**Trigger:** The clock passes the ride's date and time, in Israel time.

**Driver side**

- The cancel button disappears from that card.
- If it's today and every active ride today has left, the day shows “שעת היציאה עברה”.
- A one-time ride moves from active to history in my routes.

**Passenger side**

- The booking moves from upcoming to history in my rides.
- It appears in payments as a charge (unless the driver cancelled that date).
- The ride leaves search and can't be booked.

**Where it shows**

`/dashboard`, `/routes`, `/my-rides?tab=history`, `/payments`. Pages update on the next load.

#### G2. A passenger marks a ride as paid

**Trigger:** On payments she taps a ride's “לא שולם” pill.

**Driver side**

Nothing; the driver never sees payment marks.

**Passenger side**

- The pill switches to “שולם” at once.
- The month's paid and left-to-pay amounts and the per-driver balance update.
- Tapping again switches it back.

**Where it shows**

`/payments`: “סיכום תשלומים אישי” and “יתרה לפי נהגת”.

**Rules:** the month list covers this month and the 3 before; the per-driver balance covers all months. Each ride is charged at the price saved on its booking.

### H. Admin

#### H1. An admin adds a group or changes its places

**Trigger:** On group management she picks an origin and a destination from the list of places (H6).

**Driver side**

A new group becomes selectable in the route editor. A group given another place shows its new name on all existing routes.

**Passenger side**

The group appears in the search filter; a changed group shows its new name everywhere, including past bookings.

**Where it shows**

`/admin/groups`, route editor, search filter, every ride card and booking row.

**Rules:** origin and destination must be different places (“היעד חייב להיות שונה מנקודת המוצא”; two neighborhoods of one city are different places); a duplicate is refused with “הקבוצה הזו כבר קיימת.” With fewer than two places on the list, the dialog says “קודם הוסיפי לפחות שני מקומות לרשימת המקומות.” and can't be saved. A place in a city without a map area can still be used, but its map isn't limited.

#### H2. An admin hides a group

**Trigger:** She switches a group to hidden.

**Driver side**

Drivers can't pick it for new routes. Existing routes in it keep running and stay on their dashboards and in my routes.

**Passenger side**

- Its rides disappear from search and the filter.
- Existing bookings stay.
- A ride page opened from a saved link shows “הנסיעה אינה זמינה” and can't be booked.

**Where it shows**

`/admin/groups`; search no longer lists it.

**Rules:** the database refuses a booking in a hidden group (`RIDE_UNAVAILABLE`, migration 0027). The driver can still add passengers by hand to her existing rides in it. Showing the group again reopens booking.

#### H3. An admin deletes a group

**Trigger:** She deletes a group.

**Driver side**

Only possible if no route ever used it. Otherwise: “יש מסלולים בקבוצה הזו — אפשר להסתיר אותה במקום למחוק.”

**Passenger side**

An unused group simply disappears from the filter.

**Where it shows**

`/admin/groups`.

#### H4. An admin gives a user a personal code

**Trigger:** She adds an address under “כניסה עם קוד אישי” on the admin page.

**Result**

- The address gets an account right away, unless it already has one, and appears on the list.
- Its code shows once on her screen, for her to pass on. It isn't emailed to anyone and can't be looked up later.
- “קוד חדש” replaces a lost or leaked code; the old one stops working at once.
- “הסרה” stops sign-in with the code. The account, its rides and any open session stay.

**Rules:** only admins see or change the list, and nobody can read a code: only its hash is stored. An address already on the list is refused.

#### H5. An admin sees the site-wide totals

**Trigger:** She opens the admin page.

**Result**

- Today: passengers traveling (“טרמפיסטיות נוסעות היום”) and rides departing (“נסיעות יוצאות היום”).
- To date: rides that departed with passengers (“נסיעות שיצאו עם טרמפיסטיות”) and passengers who traveled (“טרמפיסטיות שנסעו עד היום”).
- Users in the system (“משתמשות במערכת”): those who finished sign-up.
- Active routes (“מסלולים פעילים”), the drivers who have one (“נהגות עם מסלולים”), and visible groups (“קבוצות פעילות”). Each group row shows its own count of active routes.

**Rules:** only admins can read the totals. Each active booking counts as one passenger on one ride, guests included, so a round trip counts twice. Dates the driver cancelled aren't counted. Today's rides include every scheduled ride, booked or not; a ride counts as departed only if it had at least one passenger, since a ride that left empty leaves no record. A route is active as in its driver's “מסלולים פעילים” tab: not removed, and not a one-time ride that took place or was cancelled for its date. The totals leave out routes in hidden groups, which can't be booked; a hidden group's row still shows its own count. Days follow Israel time.

#### H6. An admin keeps the list of places

**Trigger:** On group management, under “מקומות”, she adds a place (“מקום חדש”: a city and a neighborhood or area), renames one, or deletes one.

**Result**

A new place can be picked as a group's origin or destination. A renamed place renames every group that uses it, everywhere, including past bookings. Each row shows how many groups use the place. The places are listed by city, each city folding open to its neighborhoods; “פתיחת הכל” and “סגירת הכל” above the list open or fold every city.

**Where it shows**

`/admin/groups`; through the groups, every screen that shows a group.

**Rules:** city and neighborhood are each 2–40 characters, and the city has no comma; spaces around them are trimmed. A place already on the list is refused with “המקום הזה כבר ברשימה.” Only a place no group uses can be deleted (it asks first, and the delete button appears only then); the database refuses the rest with “יש קבוצות עם המקום הזה, ולכן אי אפשר למחוק אותו.” Only admins change the list; everyone signed in can read it (migration 0040).

### I. Support and errors

#### I1. A user sends a message through the contact form

**Trigger:** She presses “צרי קשר” in the top bar and sends a message.

**Driver side**

Same for drivers.

**Passenger side**

The message is emailed to the support address, with her email as the reply address. If sending fails, she sees a general error.

**Where it shows**

Top bar dialog. The support inbox receives it; nothing is stored in the app.

**Rules:** signed-in users only. No limit on how many messages one user can send.

#### I2. A page can't load its data

**Trigger:** The database is unreachable, or an unexpected error happens.

**Driver side**

Same screen for both.

**Passenger side**

“לא הצלחנו לטעון את הנתונים”, with the support email and “ניסיון חוזר”, which loads the page's data again. If the whole site fails: “משהו השתבש”.

**Where it shows**

In place of the page.

## 5. Who sees what

*These limits are enforced by the database's access rules, not only by the screens.*

| Information | The driver | A booked passenger | Other users |
|---|---|---|---|
| Driver's name, vehicle, routes, note | Yes | Yes | Yes |
| Driver's phone and email | Own | While her booking is active (including dates the driver cancelled) | No |
| Passenger's name, phone, email | For passengers booked on her rides (also in her daily email, D7, which stays in her mailbox) | Own only | No |
| Who else is booked on a ride | Yes | No, only the number of free seats | No |
| Guests the driver added | Name and phone she entered | No | No |
| Paid / unpaid marks | No | Own only | No |
| Site totals (members, active routes) | Yes | Yes | Yes, including signed-out visitors; totals only |
| Ride groups and the list of places | Yes | Yes | Every signed-in user; only admins change them (H1, H6) |
| Site-wide ride totals (H5) and the personal-code list (H4) | No | No | Admins only; codes are stored only as a hash, so nobody can read them |

## 6. Booking and ride states

*How each combination looks on each side. "Departed" means the ride's date and time have passed.*

| State | Passenger: my rides | Passenger: payments | Driver: dashboard | Search |
|---|---|---|---|---|
| Active, before departure | Upcoming, with cancel button and driver contact | Not yet | Listed with contact details | Counts as a taken seat |
| Active, departed | History | Charged | Listed; no cancel button | Not listed |
| Driver cancelled the date, before departure | Upcoming, “הנהגת ביטלה את הנסיעה”, no cancel button | Never | Card marked “בוטלה לתאריך זה” | Not listed |
| Driver cancelled the date, departed | History, same label | Never | Card marked cancelled | Not listed |
| Driver removed the route | Upcoming dates marked cancelled by the driver | Never for those dates | Not shown | Not listed |
| Passenger cancelled | Not shown | Never | Not shown; seat free | Seat free |
| Guest added by driver | Not in anyone's | Not in anyone's | Listed, “נוספה על ידך” | Counts as a taken seat |

## 7. Messages reference

*Messages shown when the database refuses an action. The code is what the database raises.*

| Code | Shown to | Message | When |
|---|---|---|---|
| `RIDE_FULL` | Passenger / driver | “הנסיעה התמלאה — אין יותר מקומות פנויים.” / “אין מקומות פנויים בנסיעה הזו.” | No seat left |
| `ALREADY_BOOKED` | Passenger / driver | “את כבר רשומה לנסיעה הזו.” / “הטרמפיסטית כבר רשומה לנסיעה הזו.” | Same passenger on the same ride |
| `RIDE_UNAVAILABLE` | Passenger / driver | “הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).” / “הנסיעה בוטלה או לא מתקיימת בתאריך הזה.” | Cancelled, removed, not running that day, or (for passengers) departed |
| `OWN_RIDE` | Passenger / driver | “אי אפשר להירשם לנסיעה שאת נוהגת בה.” / “אי אפשר להוסיף את עצמך כטרמפיסטית.” | Driver booking her own ride |
| `INVALID_STOP` | Both | “יש לבחור תחנת איסוף ותחנת הורדה מהרשימה.” | Stop not on the route |
| `BOOKING_NOT_FOUND` | Both | “ההרשמה לא נמצאה או שכבר בוטלה.” | Cancelling a booking that isn't hers or is already cancelled |
| `RIDE_DEPARTED` | Both | “הנסיעה כבר יצאה ולא ניתן לבטל אותה.” | Cancelling after departure |
| `RIDE_CANCELLED` | Driver | “הנסיעה בוטלה לתאריך הזה, ואי אפשר להחזיר אותה.” | Undoing a date cancellation |
| `RIDE_PAST` | Driver | “הנסיעה כבר התקיימה ונשמרת בהיסטוריה — אי אפשר להסיר אותה.” | Removing a one-time ride that took place |
| `ROUTE_LOCKED` | Driver | “כבר נרשמו טרמפיסטיות למסלול, ולכן אי אפשר לשנות אותו — אפשר רק לערוך את ההערה ולהוסיף תחנות.” | Editing a booked route beyond its note and new stops |
| `INVALID_PASSENGER` | Driver | “יש להזין שם וטלפון.” | Bad guest name or phone |
| `GUEST_EXISTS` | Driver | Not shown as an error: the form asks “כבר יש הרשמה עם מספר הטלפון הזה (…). להחליף אותה?” | Adding a guest phone that already has a seat on that ride and date (D5) |

## 8. Not in the system

*Things a reader might expect, and how the app behaves instead.*

| Topic | Current behaviour |
|---|---|
| Notifications and mailing | Only the optional daily email of tomorrow's passengers, for drivers (D7). Bookings, cancellations and date cancellations are not sent to anyone as they happen; each side sees them on its own screens on the next load. Coordination is by phone. |
| Reports, suspending accounts, removing others' rides | No screens. Reports arrive through the contact form or by email; the terms reserve these rights, and they are carried out by hand in the database. |
| Consent records | The sign-in consent to the terms and the privacy policy isn't saved, and existing users aren't asked again. |
| Paid subscriptions | None. The terms allow adding paid features later. |
| Account deletion | By request to support; there's no self-service deletion and no automatic deletion. |
| Navigation buttons (Waze, Google Maps) | None, for drivers or passengers. Stops appear by name and on the route map. |
| Return rides | Only the outbound ride exists. Drivers set no return time. |
| Per-date time changes | Removed. A ride always leaves at its route's time. |
| Late cancellations | Removed. Every passenger cancellation is regular and free. |
| Editing a route | Not possible after publishing, except editing the note and adding stops. |
| Driver's ride history | One-time rides that took place are under “היסטוריה” in my routes. Past dates of a recurring route are not listed there; past weeks are visible through the dashboard's date picker. |
| Vehicle before driving | Not required. Any user can publish routes without vehicle details. |
| Removing a cancelled one-time ride | Hidden in the page, not blocked by the database. |
| Contact form limits | No limit on messages per user. |
| Confirmation before a passenger cancels | None; cancelling is one click. |
| Live updates | Screens show the state when loaded; they don't refresh on their own when the other side acts or a ride departs. |


