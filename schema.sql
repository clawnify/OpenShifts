-- OpenShifts schema.
--
-- A rota for shift teams: restaurants, hotels, retail floors, care homes,
-- warehouses. `org_id` is the only tenant key and the platform injects it on
-- every request; nothing here knows about a company beyond that.
--
-- Two conventions that keep the rest of the app simple:
--
--   * A clock time is INTEGER minutes from local midnight, never a timestamp.
--     A shift is wall-clock ("Tuesday 18:00") and does not move when the clocks
--     change, so storing an instant would be wrong twice a year. A night shift
--     has end_min <= start_min and is read as crossing midnight.
--   * A date is TEXT 'YYYY-MM-DD' and a week is the TEXT date of its Monday.
--     Both sort correctly as strings, which is the whole reason for the format.
--
-- DDL only. A seed INSERT here fails the entire first deploy.

CREATE TABLE employees (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  -- Job title, and the role a shift asks for. Free text on purpose: every
  -- trade names its own jobs, and an enum here would be wrong everywhere.
  role           TEXT NOT NULL DEFAULT '',
  -- Pay in minor units (cents/pence) so money is never a float.
  hourly_rate    INTEGER NOT NULL DEFAULT 0,
  -- Hours the contract promises per week. 0 means casual/zero-hours.
  contract_hours REAL NOT NULL DEFAULT 0,
  -- Maximum this person may be scheduled in a week. 0 means no cap.
  max_hours      REAL NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX employees_org ON employees (org_id, active, name);

-- The recurring weekly pattern of when someone cannot (or would rather not)
-- work. This is the table the research says every product collects and then
-- ignores: assignment checks it, so an ignored availability is impossible to
-- ship silently.
CREATE TABLE availability (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  -- 0 = Monday … 6 = Sunday, matching week_start being a Monday.
  weekday     INTEGER NOT NULL,
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  -- 'unavailable' blocks and warns; 'preferred' only informs.
  kind        TEXT NOT NULL DEFAULT 'unavailable',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX availability_employee ON availability (org_id, employee_id, weekday);

-- Holiday, sickness, parental leave. An approved row blocks assignment for
-- every date it covers, inclusive of both ends.
CREATE TABLE time_off (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  -- 'holiday' | 'sick' | 'unpaid' | 'other'. Free text so a team can add its own.
  kind        TEXT NOT NULL DEFAULT 'holiday',
  -- 'pending' | 'approved' | 'declined'
  status      TEXT NOT NULL DEFAULT 'pending',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  decided_at  TEXT
);

CREATE INDEX time_off_org_dates ON time_off (org_id, status, start_date, end_date);

-- One week of the rota, and the record of whether it has been promised to
-- anyone. published_at is what turns every later edit into a logged change.
CREATE TABLE weeks (
  org_id       TEXT NOT NULL,
  -- The Monday, 'YYYY-MM-DD'.
  week_start   TEXT NOT NULL,
  published_at TEXT,
  published_by TEXT NOT NULL DEFAULT '',
  -- Labour budget for the week in minor units. 0 means no budget set.
  -- Deliberately on the free tier: the spreadsheets this replaces are kept
  -- precisely because they total the wage bill.
  budget       INTEGER NOT NULL DEFAULT 0,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (org_id, week_start)
);

CREATE TABLE shifts (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  -- Denormalised from `date` so a week loads with one indexed range scan.
  week_start  TEXT NOT NULL,
  date        TEXT NOT NULL,
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  -- Unpaid break inside the shift, subtracted from paid hours.
  break_min   INTEGER NOT NULL DEFAULT 0,
  -- The job this shift needs doing. Matched against employees.role when
  -- suggesting who can take it; never enforced, because real floors improvise.
  role        TEXT NOT NULL DEFAULT '',
  -- NULL is an open shift: real, visible, and claimable, not a gap.
  employee_id TEXT,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX shifts_org_week ON shifts (org_id, week_start, date, start_min);
CREATE INDEX shifts_org_employee ON shifts (org_id, employee_id, date);

-- The point of this app.
--
-- Every edit to a shift in a week that has already been published writes a row
-- here, and the row is shown to the whole team on the staff page. A rota that
-- changes after it is published is not a bug to hide; it is a fact the people
-- working it are entitled to see, with a name and a time against it.
CREATE TABLE changes (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  week_start TEXT NOT NULL,
  -- Kept even after the shift is deleted, so the log survives what it describes.
  shift_id   TEXT,
  -- 'added' | 'removed' | 'reassigned' | 'retimed' | 'published' | 'unpublished'
  kind       TEXT NOT NULL,
  -- One human sentence, written at the moment of the change while both the old
  -- and the new value are still in hand.
  detail     TEXT NOT NULL,
  -- Who did it: the platform user's display name, or 'agent'.
  actor      TEXT NOT NULL DEFAULT '',
  -- Whose shift it was, so a person can filter the log down to their own week.
  employee_id TEXT,
  -- Hours of notice between the change and the shift starting. Negative means
  -- the shift had already started. This is the number the complaints are about.
  notice_hours REAL,
  at         TEXT NOT NULL
);

CREATE INDEX changes_org_week ON changes (org_id, week_start, at);

-- A shift someone wants to hand over, and who has offered to take it.
-- The trail exists so a swap is not a message in a chat window that nobody can
-- produce afterwards.
CREATE TABLE swaps (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL,
  shift_id        TEXT NOT NULL,
  -- Who is giving the shift up. NULL when the shift was open to begin with.
  from_employee_id TEXT,
  -- Who has offered to take it. NULL until someone does.
  to_employee_id  TEXT,
  -- 'pending' | 'approved' | 'declined' | 'withdrawn'
  status          TEXT NOT NULL DEFAULT 'pending',
  reason          TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  decided_at      TEXT,
  decided_by      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX swaps_org_status ON swaps (org_id, status, created_at);

-- What actually happened, against what was scheduled. Clocking is the feature
-- these products are judged on, so it is plain: two times and the shift they
-- belong to, with nothing clever in between.
CREATE TABLE time_entries (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  -- The shift this is worked against, when there is one. NULL is unscheduled work.
  shift_id    TEXT,
  date        TEXT NOT NULL,
  clock_in    INTEGER NOT NULL,
  -- NULL while the person is still on the clock.
  clock_out   INTEGER,
  break_min   INTEGER NOT NULL DEFAULT 0,
  -- 'app' | 'manual' | 'agent'
  source      TEXT NOT NULL DEFAULT 'app',
  -- 'open' | 'pending' | 'approved'
  status      TEXT NOT NULL DEFAULT 'open',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX time_entries_org_date ON time_entries (org_id, date, employee_id);

CREATE TABLE settings (
  org_id            TEXT PRIMARY KEY,
  business_name     TEXT NOT NULL DEFAULT '',
  -- Minimum hours off between two shifts. 11 is the EU Working Time Directive
  -- daily rest. It is the check that catches a close followed by an open, which
  -- is the shift pattern people quit over.
  min_rest_hours    REAL NOT NULL DEFAULT 11,
  -- Weekly hours past which time counts as overtime, for the cost estimate.
  overtime_after    REAL NOT NULL DEFAULT 40,
  -- Multiplier applied to hours past overtime_after, in hundredths (150 = 1.5x).
  overtime_rate     INTEGER NOT NULL DEFAULT 150,
  currency          TEXT NOT NULL DEFAULT 'EUR',
  -- The team's read-only link: /s/<share_token>. One stable URL for everyone,
  -- which is what a WhatsApp group actually is. Rotating it revokes every copy.
  share_token       TEXT NOT NULL DEFAULT '',
  -- Whether the staff page shows the post-publish change log. On by default;
  -- an install that turns it off is making a choice it has to make deliberately.
  show_changes      INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL
);

CREATE UNIQUE INDEX settings_share_token ON settings (share_token);
