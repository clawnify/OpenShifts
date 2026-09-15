// The home screen: everything waiting on a decision, and nothing else.
// Screenshot-friendly on purpose, so an agent can hand a person one picture of
// where the week stands.

import { AlertTriangle, CalendarDays, Clock, Inbox, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Skeleton, Tile, Toolbar } from "./shell";
import type { Summary } from "../api";
import { longDate } from "@/lib/format";

export function Overview({
  summary,
  loading,
  onGo,
}: {
  summary: Summary | null;
  loading: boolean;
  onGo: (id: string) => void;
}) {
  if (loading) {
    return (
      <>
        <Toolbar title="Overview" />
        <div className="p-6">
          <Skeleton rows={4} />
        </div>
      </>
    );
  }

  if (!summary || summary.active_people === 0) {
    return (
      <>
        <Toolbar title="Overview" />
        <div className="p-6">
          <Empty
            title="Set up your rota"
            body="Add the people who work shifts, record when they cannot work, then build the week and publish it. Publishing is what turns the schedule into something your team can rely on."
            action={
              <Button variant="primary" onClick={() => onGo("team")}>
                <Users /> Add the team
              </Button>
            }
          />
        </div>
      </>
    );
  }

  const waiting = summary.pending_time_off + summary.pending_swaps;

  return (
    <>
      <Toolbar
        title={summary.business_name || "Overview"}
        subtitle={`Week of ${longDate(summary.this_week)} · ${summary.published ? "published" : "still a draft"}`}
        actions={
          <Button variant="primary" onClick={() => onGo("schedule")}>
            <CalendarDays /> Open the schedule
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* A shift count is a plain number, so it stays white. Only a stat that
              IS a status earns a tint, or none of them says anything. */}
          <Tile label="This week" value={summary.shifts} meta={summary.published ? "published" : "not published yet"} />
          <Tile
            label="Open shifts"
            value={summary.open_shifts}
            meta={summary.open_shifts ? "still uncovered" : "all covered"}
            tone={summary.open_shifts ? "warning" : undefined}
          />
          <Tile label="Waiting on you" value={waiting} meta={waiting ? "time off and swaps" : "nothing pending"} tone={waiting ? "info" : undefined} />
          <Tile label="On the clock" value={summary.on_clock} meta={summary.on_clock ? "working now" : "nobody working"} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Needs a decision" subtitle="Everything that will not move until someone answers it.">
            <ul className="divide-y divide-border">
              <Row
                icon={<Inbox className="size-4" />}
                label="Time off to approve"
                value={summary.pending_time_off}
                onClick={() => onGo("requests")}
              />
              <Row
                icon={<Inbox className="size-4" />}
                label="Swaps to approve"
                value={summary.pending_swaps}
                onClick={() => onGo("requests")}
              />
              <Row
                icon={<Clock className="size-4" />}
                label="Timesheet entries to approve"
                value={summary.unapproved_entries}
                onClick={() => onGo("timeclock")}
              />
              <Row
                icon={<AlertTriangle className="size-4" />}
                label="Open shifts this week"
                value={summary.open_shifts}
                onClick={() => onGo("schedule")}
              />
            </ul>
          </Card>

          <Card title="The week" subtitle="Publishing is the promise. Everything after it is on the record.">
            <ul className="divide-y divide-border">
              <Row icon={<Users className="size-4" />} label="People on the roster" value={summary.active_people} onClick={() => onGo("team")} />
              <Row icon={<CalendarDays className="size-4" />} label="Shifts scheduled" value={summary.shifts} onClick={() => onGo("schedule")} />
            </ul>
            <p className="mt-3 text-sm text-muted">
              {summary.published
                ? "This week is published. Any change you make now is recorded and shown to the team, with how much notice they got."
                : "This week is still a draft, so nobody has been told about it yet. Publish it when it is ready."}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: number; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-sm px-1 text-left transition-colors duration-150 ease-out hover:bg-sunken"
      >
        <span className="flex items-center gap-2 text-sm">
          <span className="text-muted">{icon}</span>
          {label}
        </span>
        <span className="tnum text-sm font-medium">{value}</span>
      </button>
    </li>
  );
}
