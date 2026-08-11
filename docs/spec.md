# Samferd — Product Specification

> *samferd* — from *sam-* ("co-") + *ferd* ("journey"): to travel together with someone.

**Status:** Draft v1 — pending final approval
**Related docs:** [data-model.md](data-model.md) · [api.md](api.md) · [architecture.md](architecture.md)

---

## 1. Vision & philosophy

Samferd is a **self-hostable, non-commercial helper tool** for groups of people travelling
to the same destination from roughly the same area. Its goals:

1. **Minimize the number of cars** driving to the airport.
2. **Minimize the overall travel cost per person** (air fare + car costs + airport parking).
3. **Inform, never enforce**: the app coordinates and surfaces information; users decide
   everything themselves until the very end. There is no event locking and no booking on
   behalf of users.

The app does not process payments, does not take commissions, and is not designed to make
money.

## 2. Scope summary

| In scope (v1) | Out of scope (v1) |
|---|---|
| Invite-only user registration | Open public sign-up |
| Events with multiple origin & destination airports | Trains, buses, ferries |
| Cached flight price table (Google Flights, top 3 offers per route) | In-app booking / payment |
| Car offers, seat requests with driver approval | Automatic car assignment |
| Cost-split computation (informative) | Settlement / debt tracking |
| Booked-flight declaration + API enrichment | Real-time flight status tracking |
| Better-route email alerts with per-user criteria ranking | Push / SMS notifications |
| Email notifications (invites, seat requests, alerts) | |
| Multi-language UI (default: French) | |
| GDPR: erasure, JSON export, minimal data | |

## 3. Roles & access control

| Role | Scope | Capabilities |
|---|---|---|
| **Site admin** | instance | Everything. Manage users, grant organizer rights, manage all events, set airport parking defaults, configure API credentials & refresh policies. |
| **Organizer** | per user (granted by admin) | Create events; for own events: edit details, add airports (any time), set currency, generate invite links, remove participants. |
| **Participant** | per event | Join via invite link, declare travel mode, view/act on everything inside the event. |
| **Registered user** | instance | Manage own profile, see only events they participate in. |

Access rules:

- The entire site requires authentication. No anonymous pages except login/signup-via-invite.
- **Sign-up is exclusively via an event invite link.** There is no public registration page.
- Events and their contents are visible **only to their participants** (plus site admins).

## 4. Authentication & registration

- **Pluggable OIDC** (any standard provider) **plus email/password fallback** for
  self-hosters without an identity provider. Both configurable per instance.
- Note: the OIDC provider may itself restrict who can authenticate; the invite-link
  requirement applies *in addition* — a valid OIDC login without an invite (and no existing
  account) cannot create an account.

### Invite links

- Created by an event's organizer (or admin); bound to **one event**.
- **Multi-user**: the same link can be used by any number of people.
- **Expiry: automatic when the event's end date has passed.** An organizer may also revoke
  a link manually.
- Flow: open link → authenticate (OIDC or create email/password account) → account created
  if needed → automatically joined to the event.
- An already-registered user opening an invite link simply joins the event.

## 5. User profile

| Field | Required | Purpose |
|---|---|---|
| Display name | yes | Shown to other participants |
| Email | yes | Login (fallback) + notifications |
| Home city / postal code | no | Geocoded once; used to default-rank origin airports closest-first |
| Preferred language | no (default: instance default, French) | UI language |
| Route criteria ranking | no (default: price > legs > duration > airport preference) | Better-route alerts, table sorting |

## 6. Events

An event represents one group trip. Fields:

- Name, description, destination label (free text, e.g. "Ski trip Innsbruck").
- **Travel dates**: outbound date and return date (fixed dates, no flexible range in v1).
- **Origin airports**: one or more, set at creation, **can be added later** by the organizer.
- **Destination airports**: one or more, same rules.
- **Currency**: chosen by the organizer at creation, **default EUR**. *All* monetary values
  in the event (fares, car costs, parking) are displayed and entered in this single currency.
- Lifecycle: **Open → Past**. Transition is automatic when the return date passes.
  **No locking**: participants can change anything until the event is past. Past events are
  read-only history.

### Event page contents

1. **Participants list**: name, travel mode (flying / driving / undecided), booking status,
   declared flight (number, date, enriched details).
2. **Cars section**: each car offer with driver, free seats, approved riders, pending
   requests, and computed per-person cost.
3. **Price table** (see §8).
4. **Cost overview** (see §9).

## 7. Participation & car pooling

On joining, a participant declares a travel mode (changeable at any time):

- **Flying** — will need a seat in a car to the airport (or own arrangement).
- **Driving** — offers a car: departure airport, number of free seats, optional note
  (departure point/time), flat cost amount (see §9).
- **Undecided** — default.

### Seat matching (driver-approval model)

1. A flyer sends a **seat request** to a specific car (only if free seats > 0).
2. The driver receives an email + in-app notification and **approves or declines**.
3. On approval the seat is assigned; free-seat count decreases.
4. Either side can cancel later (no locking); both get notified.
5. A rider can only occupy one seat per direction; requests to other cars are auto-withdrawn
   on approval.

## 8. Flight prices

### Provider

- **Google Flights** (via the open-source `fast-flights` scraper) is the v1 provider.
- The integration sits behind a **provider abstraction** so Skyscanner (or Kiwi, etc.) can
  be added later without touching the rest of the app. See [api.md](api.md).

### Price table

- For each *origin → destination* pair of the event and each direction (outbound/return),
  the app shows the **top 3 itinerary offers**: total price (event currency), number of
  legs, total duration, carriers, flight numbers per segment, and a **booking deep link**.
- Users can sort/filter the table; their personal airport ranking (see §10) drives the
  default order.
- Each offer shows its **fetch timestamp** so staleness is always visible.

### Refresh policy

- **Scheduled refresh** per event, rate configurable by the organizer/admin
  (default: every 12 h).
- Only **active events** are refreshed: not past, and having ≥ 1 participant.
- **Manual refresh button** per event with a cooldown (default: 1 h, admin-configurable).
- Global instance-level rate limiter to respect API quotas. Quota math in [api.md](api.md).
  Free-tier quotas are sufficient for the expected load (≤ ~3 concurrent events); paid API
  usage is a future option, not a v1 concern.

### Booked flights

Booking status per participant and direction:

```
Searching ──► Booked ──► Confirmed
              (flags: refundable? yes/no)
```

- **Booked**: user enters flight number + date (+ refundable flag). The app keeps the
  entry as declared and flags it "unverified" — automatic flight-status enrichment is
  **not available** with the Google Flights provider.
- **Confirmed**: the user asserts the booking is final.
- Other participants see everyone's flights on the event page.

## 9. Costs & split computation

All amounts in the **event currency**.

- **Parking**: site admin maintains a **default parking price per airport** (per day or
  flat, admin's choice). A driver can **override** with their actual cost.
- **Car cost**: the driver enters a **flat amount** (fuel + tolls, their estimate).
- **Per-person car share** = (car cost + parking cost) ÷ (driver + approved riders).
- The app displays, per participant: flight price (from declared booking if entered,
  otherwise blank) + car share = **estimated total per person**, and an event-level
  average.
- Purely **informative** — no settlement, no debt tracking (possible v2).

## 10. Better-route alerts & criteria ranking

### Personal criteria ranking

Each user ranks four criteria in strict priority order (drag-and-drop):

1. **Price** (lower is better)
2. **Legs** (fewer is better)
3. **Duration** (shorter is better)
4. **Airport preference** (user's manual ranking of the event's origin airports; defaults
   to closest-first when a home city is set, otherwise to the event's airport order)

Default ranking: price > legs > duration > airport preference.

### Comparison rule

Offers are compared **lexicographically** in the user's priority order, with a
**tie tolerance** so a trivially better top criterion doesn't mask big regressions below:
two values within **5 %** (configurable per instance; absolute threshold for legs: equal
count) are considered tied, and comparison falls through to the next criterion.

### Alert triggering

After each scheduled refresh, for every participant of an active event:

- Skip users whose status is **Confirmed with a non-refundable ticket** — never alert them.
- Compare the best newly-fetched offer against the user's reference: their **booked flight
  price** if booked, else the best offer from the previous refresh.
- If strictly better under the comparison rule → send a **better-route email** (deep link,
  flight numbers, what improved). At most **one alert email per user per event per 24 h**
  (digest of all improvements).

## 11. Notifications (v1, email only)

| Trigger | Recipient |
|---|---|
| Seat request received | Driver |
| Seat request approved / declined / cancelled | Rider (or both on cancel) |
| Better route found (daily digest, see §10) | Eligible participants |
| Invited to event *(link shared out-of-band; this covers organizer-triggered direct email invites)* | Invitee |

All notification types individually opt-out-able in the user profile. Requires a configured
SMTP server (see [architecture.md](architecture.md)).

## 12. Internationalization

- All UI strings via **translation template files in the repo** (Django's standard
  `gettext` `.po`/`.mo` workflow).
- **Default language: French.** English shipped as second locale in v1. Community
  translations via PRs.
- Dates, numbers and currency formatted per locale.

## 13. GDPR & privacy

- **Minimal data collection**: only fields listed in §5; home city is optional; no
  analytics/trackers by default.
- **Right to erasure**: self-service account deletion. Personal data is removed;
  contributions needed for event coherence (car offers, seat history) are anonymized.
- **Data export**: self-service JSON export of all personal data.
- Cached flight offers contain no personal data.
- Self-hosters are the data controllers; the repo ships a privacy-policy template.

## 14. Non-functional requirements

- **Deployment**: Docker Compose, single-command self-hosting. See
  [architecture.md](architecture.md).
- **Scale target**: small — tens of users, ≤ ~3 concurrent events. No premature
  optimization.
- **Responsive web UI, mobile-first**; no native app.
- **Accessibility**: reasonable effort (semantic HTML, keyboard navigable).
- **License**: open source (to be chosen — suggestion: AGPL-3.0 to keep hosted forks open).

## 15. Open points / v2 candidates

- Settlement & debt tracking (mini-Splitwise).
- Flexible date ranges ("cheapest weekend in February").
- Additional fare providers (Skyscanner if partner access is granted, Kiwi).
- Rides *from* the destination airport to the final venue.
- Push notifications / calendar (iCal) export.
- Paid API tier & multi-instance federation if usage grows.
