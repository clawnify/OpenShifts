// Clocking in and out, and the timesheet that comes out of it.
//
// The punch is the feature this category is actually judged on, so the control
// is one button per person and nothing stands between it and the write.

import { useCallback, useEffect, useState } from "react";
import { Check, LogIn, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, Empty, GroupHeader, Skeleton, Tile, Toolbar } from "./shell";
import { api, type Employee, type TimeEntry } from "../api";
import { clock, hours, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Timeclock({ onError }: { onError: (m: string) => void }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [people, setPeople] = useState<Employee[]>([]);
  const [onClock, setOnClock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([api.entries(), api.employees()]);
      setEntries(e.items);
      setOnClock(e.on_clock);
      setPeople(p.items);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const running = new Map(entries.filter((e) => e.clock_out === null).map((e) => [e.employee_id, e]));
  const pending = entries.filter((e) => e.status === "pending");
  const settled = entries.filter((e) => e.status === "approved");
  const worked = entries.reduce((n, e) => n + e.hours, 0);
  const variance = entries.reduce((n, e) => n + (e.variance_hours ?? 0), 0);

  return (
    <>
      <Toolbar
        title="Time clock"
        subtitle="What actually happened, next to what was scheduled."
        view={
          <>
            <span className="tnum text-[0.8125rem] font-medium text-muted">{onClock} on the clock now</span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="text-[0.8125rem] text-muted">{pending.length} waiting for approval</span>
          </>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Tile label="On the clock" value={onClock} meta={onClock ? "right now" : "nobody working"} tone={onClock ? "info" : undefined} />
          <Tile label="Hours logged" value={hours(worked)} meta="in this list" />
          <Tile
            label="Against schedule"
            value={`${variance >= 0 ? "+" : ""}${Math.round(variance * 10) / 10}h`}
            meta={variance > 0 ? "more than planned" : variance < 0 ? "less than planned" : "as planned"}
            tone={Math.abs(variance) > 2 ? "warning" : undefined}
          />
          <Tile label="To approve" value={pending.length} meta={pending.length ? "before payroll" : "all clear"} tone={pending.length ? "warning" : "success"} />
        </div>

        {loading ? (
          <Skeleton rows={5} />
        ) : people.length === 0 ? (
          <Empty
            title="No one to clock in"
            body="The time clock works against the roster. Add the team first, then anyone can be punched in and out from here."
            action={
              <Button variant="primary" asChild>
                <a href="/team">Add the team</a>
              </Button>
            }
          />
        ) : (
          <>
            <Card title="Punch in and out" subtitle="One tap. If someone is already on the clock, this closes their entry.">
              <ul className="divide-y divide-border">
                {people.map((p) => {
                  const open = running.get(p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{p.name}</span>
                        {open ? (
                          <span className="tnum ml-2 text-xs text-info">on since {clock(open.clock_in)}</span>
                        ) : (
                          p.role && <span className="ml-2 text-xs text-muted">{p.role}</span>
                        )}
                      </div>
                      {open ? (
                        <Button variant="secondary" disabled={busy === p.id} onClick={() => void act(p.id, () => api.clockOut(p.id, 0))}>
                          <LogOut /> Clock out
                        </Button>
                      ) : (
                        <Button variant="secondary" disabled={busy === p.id} onClick={() => void act(p.id, () => api.clockIn(p.id, null))}>
                          <LogIn /> Clock in
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Timesheet" subtitle="Approve an entry once you are happy it matches the shift.">
              {entries.length === 0 ? (
                <p className="py-2 text-sm text-muted">Nothing logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {pending.length > 0 && <GroupHeader label="Waiting for approval" count={pending.length} />}
                  <EntryTable rows={pending} busy={busy} act={act} />
                  {settled.length > 0 && <GroupHeader label="Approved" count={settled.length} />}
                  <EntryTable rows={settled} busy={busy} act={act} />
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function EntryTable({
  rows,
  busy,
  act,
}: {
  rows: TimeEntry[];
  busy: string | null;
  act: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="py-2 text-[0.8125rem] font-medium text-muted">Person</th>
          <th scope="col" className="py-2 text-[0.8125rem] font-medium text-muted">Date</th>
          <th scope="col" className="py-2 text-[0.8125rem] font-medium text-muted">Clocked</th>
          <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Worked</th>
          <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Scheduled</th>
          <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Difference</th>
          <th scope="col" className="py-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id} className="border-b border-border">
            <td className="py-2.5 text-sm">{e.employee_name}</td>
            <td className="tnum py-2.5 text-sm text-muted">{e.date}</td>
            <td className="tnum py-2.5 text-sm text-muted">
              {clock(e.clock_in)}
              {e.clock_out === null ? <Badge tone="info" className="ml-2">Still on</Badge> : `–${clock(e.clock_out)}`}
            </td>
            <td className="tnum py-2.5 text-right text-sm font-medium">{e.clock_out === null ? "—" : hours(e.hours)}</td>
            <td className="tnum py-2.5 text-right text-sm text-muted">{e.scheduled_hours === null ? "unscheduled" : hours(e.scheduled_hours)}</td>
            <td className="py-2.5 text-right">
              {e.variance_hours === null ? (
                <span className="text-sm text-faint">—</span>
              ) : (
                <span className={cn("tnum text-sm font-medium", Math.abs(e.variance_hours) >= 0.5 && "text-warning")}>
                  {e.variance_hours >= 0 ? "+" : ""}
                  {e.variance_hours}h
                </span>
              )}
            </td>
            <td className="py-2.5 text-right">
              <span className="inline-flex items-center gap-1">
                {e.status === "pending" && (
                  <Button variant="ghost" disabled={busy === e.id} onClick={() => void act(e.id, () => api.updateEntry(e.id, { status: "approved" }))}>
                    <Check /> Approve
                  </Button>
                )}
                {e.status === "approved" && <Badge tone="success">Approved</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete the entry for ${e.employee_name} on ${e.date}`}
                  disabled={busy === e.id}
                  onClick={() => void act(e.id, () => api.deleteEntry(e.id))}
                >
                  <Trash2 />
                </Button>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} className="py-2.5 text-[0.8125rem] font-medium text-muted">Total</td>
          <td className="tnum py-2.5 text-right text-sm font-semibold">{hours(rows.reduce((n, e) => n + e.hours, 0))}</td>
          <td colSpan={3} />
        </tr>
      </tfoot>
    </table>
  );
}

export { relative };
