// The week grid, and the dialog that edits one shift.
//
// The grid is a real <table>: rows are people, columns are days, and the last
// row is the open shifts nobody is holding yet. A conflict is drawn on the cell
// that causes it, at the moment it is caused, because a warning that only
// appears on a summary screen is a warning nobody reads.

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Link2, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Empty, GroupHeader, Skeleton, Tile, Toolbar } from "./shell";
import { api, type Conflict, type Shift, type Week } from "../api";
import { DAY_NAMES, addDays, clock, dayLabel, hours, longDate, money, parseClock, relative, today, weekStartOf } from "@/lib/format";
import { cn } from "@/lib/utils";

const OPEN = "__open__";

interface Draft {
  id: string | null;
  date: string;
  start: string;
  end: string;
  break_min: string;
  role: string;
  employee_id: string;
  note: string;
}

function emptyDraft(date: string, employeeId: string | null): Draft {
  return {
    id: null,
    date,
    start: "09:00",
    end: "17:00",
    break_min: "30",
    role: "",
    employee_id: employeeId ?? OPEN,
    note: "",
  };
}

function draftOf(shift: Shift): Draft {
  return {
    id: shift.id,
    date: shift.date,
    start: clock(shift.start_min),
    end: clock(shift.end_min),
    break_min: String(shift.break_min),
    role: shift.role,
    employee_id: shift.employee_id ?? OPEN,
    note: shift.note,
  };
}

export function Schedule({
  week,
  loading,
  weekStart,
  onWeek,
  onChanged,
  onError,
}: {
  week: Week | null;
  loading: boolean;
  weekStart: string;
  onWeek: (next: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const byCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of week?.shifts ?? []) {
      const key = `${s.employee_id ?? OPEN}|${s.date}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [week]);

  const conflictsByShift = useMemo(() => {
    const map = new Map<string, Conflict[]>();
    for (const c of week?.conflicts ?? []) {
      const list = map.get(c.shift_id) ?? [];
      list.push(c);
      map.set(c.shift_id, list);
    }
    return map;
  }, [week]);

  const blocking = (week?.conflicts ?? []).filter((c) => c.severity === "block").length;
  const warning = (week?.conflicts ?? []).filter((c) => c.severity === "warn").length;
  const published = Boolean(week?.published_at);

  async function save() {
    if (!draft) return;
    const start = parseClock(draft.start);
    const end = parseClock(draft.end);
    if (start === null || end === null) return onError("Times read as 09:00 or 9. Check the start and end.");
    if (start === end) return onError("A shift needs a length: the start and the end are the same.");

    const body = {
      date: draft.date,
      start_min: start,
      end_min: end,
      break_min: Number(draft.break_min) || 0,
      role: draft.role,
      employee_id: draft.employee_id === OPEN ? null : draft.employee_id,
      note: draft.note,
    };
    setBusy(true);
    try {
      if (draft.id) await api.updateShift(draft.id, body);
      else await api.createShift(body);
      setDraft(null);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await api.deleteShift(draft.id);
      setDraft(null);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = week?.employees ?? [];
  const dates = week?.dates ?? [];

  return (
    <>
      <Toolbar
        title="Schedule"
        subtitle={
          published
            ? `Published ${relative(week!.published_at as string)} by ${week!.published_by || "someone"}. Changes from here are on the record.`
            : "A draft. Nobody has been told about this week yet."
        }
        view={
          <>
            <Button variant="ghost" onClick={() => onWeek(addDays(weekStart, -7))} aria-label="Previous week">
              ←
            </Button>
            <span className="tnum text-[0.8125rem] font-medium text-muted">
              Week of {longDate(weekStart)}
            </span>
            <Button variant="ghost" onClick={() => onWeek(addDays(weekStart, 7))} aria-label="Next week">
              →
            </Button>
            <Button variant="ghost" onClick={() => onWeek(weekStartOf(today()))}>
              This week
            </Button>
            <span className="h-4 w-px bg-border" aria-hidden />
            {published ? (
              <Badge tone="success">Published</Badge>
            ) : (
              <Badge tone="chip">Draft</Badge>
            )}
            {blocking > 0 && <Badge tone="danger">{blocking} to fix</Badge>}
            {warning > 0 && <Badge tone="warning">{warning} to check</Badge>}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => act(async () => setLink((await api.shareLink()).url))}
              disabled={busy}
            >
              <Link2 /> Team link
            </Button>
            <Button
              variant="secondary"
              onClick={() => act(() => api.copyWeek(addDays(weekStart, -7), weekStart, true))}
              disabled={busy}
            >
              <Copy /> Copy last week
            </Button>
            <Button variant="secondary" onClick={() => setDraft(emptyDraft(dates[0] ?? today(), null))}>
              <Plus /> Shift
            </Button>
            {published ? (
              <Button variant="secondary" onClick={() => act(() => api.publish(weekStart, false))} disabled={busy}>
                <Undo2 /> Back to draft
              </Button>
            ) : (
              <Button variant="primary" onClick={() => act(() => api.publish(weekStart, true))} disabled={busy}>
                <Send /> Publish week
              </Button>
            )}
          </>
        }
      />

      <div className="p-6">
        {link && (
          <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm text-muted">The team opens this. No login, read-only, published weeks only.</span>
            <code className="tnum rounded-xs bg-sunken px-2 py-1 text-xs">{link}</code>
            <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(link)}>
              Copy
            </Button>
            <Button variant="ghost" onClick={() => setLink(null)}>
              Hide
            </Button>
          </div>
        )}

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <Empty
            title="No one on the roster yet"
            body="A rota needs people before it needs shifts. Add the team and their availability, then build the week."
            action={
              <Button variant="primary" asChild>
                <a href="/team">Add the team</a>
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Tile label="Scheduled" value={hours(week?.cost.hours ?? 0)} meta={`${week?.shifts.length ?? 0} shifts`} />
              <Tile
                label="Wage cost"
                value={money(week?.cost.total ?? 0, week?.currency ?? "EUR")}
                meta={week?.budget ? `of ${money(week.budget, week.currency)} budget` : "no budget set"}
                tone={week?.budget && week.cost.total > week.budget ? "danger" : undefined}
              />
              <Tile
                label="Open shifts"
                value={week?.open_shifts ?? 0}
                meta={week?.open_shifts ? "nobody holding these" : "all covered"}
                tone={week?.open_shifts ? "warning" : undefined}
              />
              <Tile
                label="Changed since publish"
                value={week?.changes.filter((c) => c.kind !== "published" && c.kind !== "unpublished").length ?? 0}
                meta={published ? "on the team's page" : "not published yet"}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left">
                <caption className="sr-only">Shifts for the week of {weekStart}, by person and day</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="w-48 px-3 py-3 text-[0.8125rem] font-medium text-muted">
                      Person
                    </th>
                    {dates.map((date, i) => (
                      <th key={date} scope="col" className="px-2 py-3 text-[0.8125rem] font-medium text-muted">
                        {DAY_NAMES[i]} <span className="tnum text-faint">{dayLabel(date)}</span>
                      </th>
                    ))}
                    <th scope="col" className="w-20 px-3 py-3 text-right text-[0.8125rem] font-medium text-muted">
                      Hours
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((person) => (
                    <tr key={person.id} className="border-b border-border align-top">
                      <th scope="row" className="px-3 py-2 font-normal">
                        <span className="block font-medium">{person.name}</span>
                        {person.role && <span className="block text-xs text-muted">{person.role}</span>}
                      </th>
                      {dates.map((date) => (
                        <Cell
                          key={date}
                          shifts={byCell.get(`${person.id}|${date}`) ?? []}
                          conflicts={conflictsByShift}
                          onOpen={(s) => setDraft(draftOf(s))}
                          onAdd={() => setDraft(emptyDraft(date, person.id))}
                        />
                      ))}
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            "tnum text-sm font-medium",
                            person.max_hours > 0 && person.hours > person.max_hours && "text-danger",
                          )}
                        >
                          {hours(person.hours)}
                        </span>
                        {person.contract_hours > 0 && (
                          <span className="block text-xs text-muted">of {hours(person.contract_hours)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="align-top">
                    <th scope="row" className="px-3 py-2 font-normal">
                      <Badge tone="accent">Open shifts</Badge>
                      <span className="mt-1 block text-xs text-muted">Nobody holding these</span>
                    </th>
                    {dates.map((date) => (
                      <Cell
                        key={date}
                        shifts={byCell.get(`${OPEN}|${date}`) ?? []}
                        conflicts={conflictsByShift}
                        onOpen={(s) => setDraft(draftOf(s))}
                        onAdd={() => setDraft(emptyDraft(date, null))}
                      />
                    ))}
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="px-3 py-3 text-[0.8125rem] font-medium text-muted">Week total</td>
                    <td colSpan={7} />
                    <td className="tnum px-3 py-3 text-right text-sm font-semibold">{hours(week?.cost.hours ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {(week?.conflicts.length ?? 0) > 0 && (
              <Card
                className="mt-6"
                title={published ? "Worth fixing" : "Worth fixing before you publish"}
                subtitle={
                  published
                    ? "This week is already out. Fixing any of these is a change the team will see."
                    : "Promises this week breaks, and policies it stretches."
                }
              >
                <ul className="divide-y divide-border">
                  {week!.conflicts.map((c, i) => (
                    <li key={`${c.shift_id}-${i}`} className="flex items-start gap-2 py-2.5 text-sm">
                      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", c.severity === "block" ? "text-danger" : "text-warning")} />
                      <span>{c.message}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {published && (week?.changes.length ?? 0) > 0 && (
              <Card
                className="mt-6"
                title="Changed after this week was published"
                subtitle="The same list the team sees on their page, in the same order."
              >
                <ul className="divide-y divide-border">
                  {week!.changes.map((ch) => (
                    <li key={ch.id} className="py-2.5">
                      <p className="text-sm">{ch.detail}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {ch.actor} · {relative(ch.at)}
                        {ch.notice_hours !== null && ch.notice_hours < 24 && (
                          <span className="text-warning">
                            {" · "}
                            {ch.notice_hours < 0 ? "after the shift started" : `${ch.notice_hours}h notice`}
                          </span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        {draft && (
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit shift" : "New shift"}</DialogTitle>
                <DialogDescription>
                  {published
                    ? "This week is published, so this change goes into the log the team can see."
                    : "This week is still a draft. Changes are not announced."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="shift-who">Who</Label>
                  <Select value={draft.employee_id} onValueChange={(v) => setDraft({ ...draft, employee_id: v })}>
                    <SelectTrigger id="shift-who">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OPEN}>Leave it open</SelectItem>
                      {rows.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.role ? ` · ${p.role}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="shift-date">Date</Label>
                    <Input
                      id="shift-date"
                      type="date"
                      value={draft.date}
                      onChange={(e) => setDraft({ ...draft, date: e.currentTarget.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="shift-break">Unpaid break, minutes</Label>
                    <Input
                      id="shift-break"
                      inputMode="numeric"
                      value={draft.break_min}
                      onChange={(e) => setDraft({ ...draft, break_min: e.currentTarget.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="shift-start">Starts</Label>
                    <Input
                      id="shift-start"
                      value={draft.start}
                      placeholder="09:00"
                      onChange={(e) => setDraft({ ...draft, start: e.currentTarget.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="shift-end">Ends</Label>
                    <Input
                      id="shift-end"
                      value={draft.end}
                      placeholder="17:00"
                      onChange={(e) => setDraft({ ...draft, end: e.currentTarget.value })}
                    />
                    <p className="text-xs text-muted">An end before the start is a night shift.</p>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="shift-role">Job</Label>
                  <Input
                    id="shift-role"
                    value={draft.role}
                    placeholder="Bar, kitchen, front desk…"
                    onChange={(e) => setDraft({ ...draft, role: e.currentTarget.value })}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="shift-note">Note for the team</Label>
                  <Textarea
                    id="shift-note"
                    value={draft.note}
                    placeholder="Stock delivery at 10, cover the door from 6."
                    onChange={(e) => setDraft({ ...draft, note: e.currentTarget.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                {draft.id && (
                  <Button variant="danger" className="mr-auto" onClick={() => void remove()} disabled={busy}>
                    <Trash2 /> Delete
                  </Button>
                )}
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" variant="primary" disabled={busy}>
                  {draft.id ? "Save shift" : "Add shift"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function Cell({
  shifts,
  conflicts,
  onOpen,
  onAdd,
}: {
  shifts: Shift[];
  conflicts: Map<string, Conflict[]>;
  onOpen: (s: Shift) => void;
  onAdd: () => void;
}) {
  return (
    <td className="group px-1 py-2">
      <div className="flex flex-col gap-1">
        {shifts.map((s) => {
          const mine = conflicts.get(s.id) ?? [];
          const blocked = mine.some((c) => c.severity === "block");
          const warned = mine.length > 0 && !blocked;
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s)}
              aria-label={`Edit shift ${clock(s.start_min)} to ${clock(s.end_min)}${mine.length ? `. ${mine.map((c) => c.message).join(" ")}` : ""}`}
              className={cn(
                "w-full rounded-sm px-2 py-1.5 text-left transition-colors duration-150 ease-out",
                blocked
                  ? "bg-danger-tint text-danger hover:bg-danger-tint/70"
                  : warned
                    ? "bg-warning-tint text-warning hover:bg-warning-tint/70"
                    : s.employee_id
                      ? "bg-sunken hover:bg-border"
                      : "bg-accent-tint text-accent-text hover:bg-accent-tint/70",
              )}
            >
              <span className="tnum block text-xs font-medium">
                {clock(s.start_min)}–{clock(s.end_min)}
              </span>
              {s.role && <span className="block truncate text-xs opacity-80">{s.role}</span>}
              {mine.length > 0 && (
                <span className="mt-0.5 flex items-center gap-1 text-xs font-medium">
                  <AlertTriangle className="size-3 shrink-0" />
                  {mine.length === 1 ? mine[0].kind.replace("-", " ") : `${mine.length} problems`}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onAdd}
          aria-label="Add a shift on this day"
          className="hover-only rounded-sm py-1 text-xs text-faint opacity-0 transition-opacity duration-150 hover:bg-sunken hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0"
        >
          + Add
        </button>
      </div>
    </td>
  );
}

export { GroupHeader };
