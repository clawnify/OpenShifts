// One inbox for the two things a manager has to answer: time off, and shifts
// changing hands. Both carry a decision and a timestamp, which is the whole
// difference between this and a chat thread.

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Empty, GroupHeader, Skeleton, Toolbar } from "./shell";
import { api, type Employee, type Swap, type TimeOff } from "../api";
import { longDate, relative, today } from "@/lib/format";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "chip"> = {
  approved: "success",
  declined: "danger",
  pending: "warning",
  withdrawn: "chip",
};

export function Requests({ onError, onChanged }: { onError: (m: string) => void; onChanged: () => void }) {
  const [off, setOff] = useState<TimeOff[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [people, setPeople] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ employee_id: "", start_date: today(), end_date: today(), kind: "holiday", note: "" });

  const load = useCallback(async () => {
    try {
      const [o, s, p] = await Promise.all([api.timeOff(), api.swaps(), api.employees()]);
      setOff(o.items);
      setSwaps(s.items);
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

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const pendingOff = off.filter((r) => r.status === "pending");
  const decidedOff = off.filter((r) => r.status !== "pending");
  const pendingSwaps = swaps.filter((r) => r.status === "pending");
  const decidedSwaps = swaps.filter((r) => r.status !== "pending");
  const waiting = pendingOff.length + pendingSwaps.length;

  return (
    <>
      <Toolbar
        title="Requests"
        subtitle="Time off and shifts changing hands. Approving leave makes those dates block the schedule."
        view={
          <>
            <span className="tnum text-[0.8125rem] font-medium text-muted">{waiting} waiting on you</span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="text-[0.8125rem] text-muted">
              {off.length} time off · {swaps.length} swap{swaps.length === 1 ? "" : "s"}
            </span>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} disabled={people.length === 0}>
            <Plus /> Record time off
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        {loading ? (
          <Skeleton rows={5} />
        ) : off.length === 0 && swaps.length === 0 ? (
          <Empty
            title="Nothing waiting"
            body="Time off you record here blocks those dates on the schedule. A shift offered up from the schedule shows here until you approve who takes it."
            action={
              <Button variant="primary" onClick={() => setCreating(true)} disabled={people.length === 0}>
                <Plus /> Record time off
              </Button>
            }
          />
        ) : (
          <>
            <Card title="Time off" subtitle="Approved dates become a hard block when you assign a shift.">
              {off.length === 0 ? (
                <p className="py-2 text-sm text-muted">Nothing recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {pendingOff.length > 0 && <GroupHeader label="Waiting" count={pendingOff.length} />}
                  <ul className="divide-y divide-border">
                    {pendingOff.map((r) => (
                      <OffRow key={r.id} row={r} busy={busy} act={act} />
                    ))}
                  </ul>
                  {decidedOff.length > 0 && <GroupHeader label="Decided" count={decidedOff.length} />}
                  <ul className="divide-y divide-border">
                    {decidedOff.map((r) => (
                      <OffRow key={r.id} row={r} busy={busy} act={act} />
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card title="Shift swaps" subtitle="Who gave a shift up, who took it, and who said yes.">
              {swaps.length === 0 ? (
                <p className="py-2 text-sm text-muted">
                  Nothing yet. Open a shift on the schedule and offer it up to start one.
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingSwaps.length > 0 && <GroupHeader label="Waiting" count={pendingSwaps.length} />}
                  <ul className="divide-y divide-border">
                    {pendingSwaps.map((r) => (
                      <SwapRow key={r.id} row={r} people={people} busy={busy} act={act} />
                    ))}
                  </ul>
                  {decidedSwaps.length > 0 && <GroupHeader label="Decided" count={decidedSwaps.length} />}
                  <ul className="divide-y divide-border">
                    {decidedSwaps.map((r) => (
                      <SwapRow key={r.id} row={r} people={people} busy={busy} act={act} />
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api.createTimeOff(draft);
                setCreating(false);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Record time off</DialogTitle>
              <DialogDescription>Approve it here or later. Approved dates raise a conflict if a shift lands inside them.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="off-who">Who</Label>
                <Select value={draft.employee_id} onValueChange={(v) => setDraft({ ...draft, employee_id: v })}>
                  <SelectTrigger id="off-who">
                    <SelectValue placeholder="Pick someone" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="off-from">First day</Label>
                  <Input id="off-from" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.currentTarget.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="off-to">Last day</Label>
                  <Input id="off-to" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.currentTarget.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="off-kind">Kind</Label>
                <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
                  <SelectTrigger id="off-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">Holiday</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="off-note">Note</Label>
                <Textarea id="off-note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.currentTarget.value })} />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={busy || !draft.employee_id}>
                Record it
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OffRow({ row, busy, act }: { row: TimeOff; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const sameDay = row.start_date === row.end_date;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">
          <span className="font-medium">{row.employee_name}</span>{" "}
          <span className="text-muted">
            {sameDay ? longDate(row.start_date) : `${longDate(row.start_date)} to ${longDate(row.end_date)}`} · {row.kind}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {row.note ? `${row.note} · ` : ""}
          asked {relative(row.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[row.status] ?? "chip"}>{row.status}</Badge>
        {row.status === "pending" ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => void act(() => api.decideTimeOff(row.id, "approved"))}>
              <Check /> Approve
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void act(() => api.decideTimeOff(row.id, "declined"))}>
              <X /> Decline
            </Button>
          </>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => api.decideTimeOff(row.id, "pending"))}>
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
}

function SwapRow({
  row,
  people,
  busy,
  act,
}: {
  row: Swap;
  people: Employee[];
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">
          <span className="tnum font-medium">{row.shift_label}</span>{" "}
          <span className="text-muted">
            from {row.from_name} to {row.to_name}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {row.reason ? `${row.reason} · ` : ""}
          offered {relative(row.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[row.status] ?? "chip"}>{row.status}</Badge>
        {row.status === "pending" && (
          <>
            {!row.to_employee_id && (
              <Select value="" onValueChange={(v) => void act(() => api.claimSwap(row.id, v))}>
                <SelectTrigger className="w-44" aria-label="Who is taking this shift">
                  <SelectValue placeholder="Who is taking it" />
                </SelectTrigger>
                <SelectContent>
                  {people
                    .filter((p) => p.id !== row.from_employee_id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="secondary"
              disabled={busy || !row.to_employee_id}
              title={row.to_employee_id ? undefined : "Nobody has offered to take it yet"}
              onClick={() => void act(() => api.decideSwap(row.id, "approved"))}
            >
              <Check /> Approve
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void act(() => api.decideSwap(row.id, "declined"))}>
              <X /> Decline
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
