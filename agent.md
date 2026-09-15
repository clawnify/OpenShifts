# OpenShifts — how to run this app

A rota for shift teams. The one thing that makes it different from every other
scheduler: **publishing a week is a promise**. After a week is published, every
edit is recorded with who made it and how much notice the person got, and the
team reads that record on the same page as the rota.

## Division of labour — what you do, and what you must leave to the app

- **Never work out whether a shift is allowed yourself.** Post it and read the
  `conflicts` array that `GET /api/week` returns. The app checks stated
  availability, approved leave, double bookings, the rest rule and weekly caps,
  in one place, with the overnight and week-boundary cases already handled. A
  rule you re-implement in a prompt will disagree with the grid the person is
  looking at.
- **Never compute hours or wage cost by hand.** `cost` on the same response is
  the number the screen shows. A shift that ends before it starts is a night
  shift, not a negative one, and hand arithmetic gets that wrong.
- **Never publish a week to silence a question.** Publishing is what starts the
  change log and what the team's link shows. If you are unsure the week is
  ready, leave it a draft and say so.
- **Do not edit a published week casually.** Every edit is attributed to
  `agent` and shown to the whole team. Make the change the person asked for,
  then tell them it is now on the record and how much notice it carried.
- **Do the data entry.** Adding people, recording availability, entering time
  off, building a week from a description, copying last week: all yours.

## The procedure

Building a week from a request like "sort next week's rota":

1. `GET /api/summary` — who is on the roster, whether this week is published,
   what is waiting. If `active_people` is 0, the roster comes first.
2. `GET /api/week?week_start=YYYY-MM-DD` — any date in the week works, it snaps
   back to the Monday. Read `employees`, `shifts`, `conflicts`, `cost`.
3. If the week repeats, `POST /api/week/copy` from the previous week rather than
   creating shifts one by one. It copies into a draft and never publishes.
4. Add or move shifts with `POST /api/shifts` and `PATCH /api/shifts/{id}`.
   Leave `employee_id` null for a shift nobody is holding yet: an open shift is
   a real, visible thing, not a gap.
5. **Re-read `GET /api/week` and clear the conflicts.** `severity: "block"` is a
   promise already made to that person (their availability, their approved
   leave, being in two places) and should be fixed, not overridden.
   `severity: "warn"` is a policy call: short rest between shifts, or hours past
   a cap. Surface those to the person and let them decide.
6. Check `cost.total` against `budget`. If there is no budget, say what the week
   costs anyway; it is the number managers are judged on.
7. `POST /api/week/publish` only when the person has said to.

Answering "who can take Saturday night?":

1. `GET /api/week` for that week. Open shifts are the ones with `employee_id: null`.
2. Candidates are people whose `hours` leave room under `max_hours`, who have no
   availability window or approved leave over that date, and who do not already
   have an overlapping shift. Rather than reasoning it out, assign the shift and
   read the conflicts back; an empty result is the answer.
3. To route it through the team instead, `POST /api/swaps` with the shift id and
   no `to_employee_id`. That puts it on the board with a trail.

## Pages

- `/` Overview — everything waiting on a decision. **Screenshot-friendly**: one
  picture of where the week stands.
- `/schedule` — the week grid, conflicts drawn on the cells that cause them,
  and the publish button.
- `/team` — the roster, pay, contract hours, and availability windows.
- `/requests` — time off and swaps, each with a decision and a timestamp.
- `/timeclock` — punch in and out, and worked hours against scheduled.
- `/insights` — cost and coverage by week, plus how often published weeks moved.
  **Screenshot-friendly.**
- `/settings` — the rest rule, overtime, currency, and the team's link.

## API anchors

Full shapes are in `/api/openapi.json` and `/llms.txt`; they are generated from
the live routes, so they cannot drift. The ones you will write most:

| Reach for it when | Call |
|---|---|
| Anything about a week | `GET /api/week?week_start=` |
| One screen of what needs deciding | `GET /api/summary` |
| Adding a shift | `POST /api/shifts` |
| Moving or reassigning one | `PATCH /api/shifts/{id}` |
| The week repeats | `POST /api/week/copy` |
| Making it real | `POST /api/week/publish` |
| Someone is off | `POST /api/time-off` then `/decide` |
| A shift changing hands | `POST /api/swaps` then `/claim`, `/decide` |
| Was the rota reliable? | `GET /api/insights` |

```jsonc
// POST /api/shifts — times are minutes from local midnight, never timestamps.
{ "date": "2026-09-17", "start_min": 1080, "end_min": 1380,
  "break_min": 30, "role": "Bar", "employee_id": null, "note": "" }
```

An `end_min` at or below `start_min` means the shift runs past midnight. This is
how you write a 22:00–06:00 night: `start_min: 1320, end_min: 360`.

## Reading failures

- **403 "No organisation on this request"** — the call arrived without a tenant.
  Nothing to retry; it is not a transient error.
- **400 "A shift needs a length"** — start and end are equal. For a 24-hour
  shift, split it.
- **400 "Nobody has offered to take this shift yet"** — approve a swap only
  after `/claim` has named someone.
- **404 "That person is not on the clock"** — clocking out with no open entry.
  Clocking in twice is safe: it returns the entry that is already running rather
  than opening a second one.

## Cost

Every call here is free: this app talks to its own database and nothing else. It
declares no model key and spends none of the org's credits. The only thing that
costs anything is a person's time, so prefer `POST /api/week/copy` over forty
`POST /api/shifts` calls when the week repeats.

## When you are asked to change how it looks

The `DESIGN.md` in this repo, if one is present, is this app's own brand layer
and outranks the platform default. Put brand decisions there rather than in a
component, and never a hardcoded colour: every value in the app resolves through
the tokens at the top of `src/client/styles.css`.
