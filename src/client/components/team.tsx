// The roster, and what each person has told you about when they can work.
//
// Availability lives on the person's own row rather than on a settings page,
// because the whole point is that it is in front of you when you are deciding
// whether to schedule them.

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Empty, Skeleton, Toolbar } from "./shell";
import { api, type Availability, type Employee } from "../api";
import { DAY_FULL, clock, hours, money, parseClock } from "@/lib/format";

interface Draft {
  id: string | null;
  name: string;
  role: string;
  email: string;
  phone: string;
  rate: string;
  contract: string;
  max: string;
}

const EMPTY: Draft = { id: null, name: "", role: "", email: "", phone: "", rate: "", contract: "", max: "" };

export function Team({ currency, onError }: { currency: string; onError: (m: string) => void }) {
  const [people, setPeople] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [windows, setWindows] = useState<Availability[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeople((await api.employees()).items);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadWindows = useCallback(
    async (id: string) => {
      try {
        setWindows((await api.availability(id)).items);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      }
    },
    [onError],
  );

  useEffect(() => {
    if (open) void loadWindows(open);
    else setWindows([]);
  }, [open, loadWindows]);

  async function save() {
    if (!draft) return;
    const body = {
      name: draft.name,
      role: draft.role,
      email: draft.email,
      phone: draft.phone,
      hourly_rate: Math.round((Number(draft.rate) || 0) * 100),
      contract_hours: Number(draft.contract) || 0,
      max_hours: Number(draft.max) || 0,
    };
    setBusy(true);
    try {
      if (draft.id) await api.updateEmployee(draft.id, body);
      else await api.createEmployee(body);
      setDraft(null);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Toolbar
        title="Team"
        subtitle="Who works here, what they cost, and when they have said they cannot work."
        view={<span className="tnum text-[0.8125rem] font-medium text-muted">{people.length} on the roster</span>}
        actions={
          <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}>
            <Plus /> Add person
          </Button>
        }
      />

      <div className="p-6">
        {loading ? (
          <Skeleton rows={5} />
        ) : people.length === 0 ? (
          <Empty
            title="Nobody on the roster"
            body="Add the people who work shifts here. Their pay rate makes the wage total real, and their availability is what stops a shift landing on a day they told you about."
            action={
              <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}>
                <Plus /> Add the first person
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {people.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[0.9375rem] font-semibold">
                      {p.name}
                      {p.active === 0 && (
                        <Badge tone="chip" className="ml-2">
                          Inactive
                        </Badge>
                      )}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">
                      {[p.role, p.email, p.phone].filter(Boolean).join(" · ") || "No details yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="tnum text-sm font-medium">{p.hourly_rate ? money(p.hourly_rate, currency) : "—"}</div>
                      <div className="text-xs text-muted">per hour</div>
                    </div>
                    <div>
                      <div className="tnum text-sm font-medium">{p.contract_hours ? hours(p.contract_hours) : "Casual"}</div>
                      <div className="text-xs text-muted">{p.max_hours ? `max ${hours(p.max_hours)}` : "no cap"}</div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          id: p.id,
                          name: p.name,
                          role: p.role,
                          email: p.email,
                          phone: p.phone,
                          rate: p.hourly_rate ? String(p.hourly_rate / 100) : "",
                          contract: p.contract_hours ? String(p.contract_hours) : "",
                          max: p.max_hours ? String(p.max_hours) : "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                      Availability
                    </Button>
                  </div>
                </div>

                {open === p.id && (
                  <AvailabilityEditor
                    employeeId={p.id}
                    windows={windows}
                    busy={busy}
                    onChanged={() => void loadWindows(p.id)}
                    onError={onError}
                    setBusy={setBusy}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && (
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit person" : "Add person"}</DialogTitle>
                <DialogDescription>The pay rate drives the week's wage total. Leave it blank if you do not track cost here.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="p-name">Name</Label>
                  <Input id="p-name" value={draft.name} required onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="p-role">Job</Label>
                  <Input
                    id="p-role"
                    value={draft.role}
                    placeholder="Barista, night porter, care assistant…"
                    onChange={(e) => setDraft({ ...draft, role: e.currentTarget.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="p-email">Email</Label>
                    <Input id="p-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.currentTarget.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="p-phone">Phone</Label>
                    <Input id="p-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.currentTarget.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="p-rate">Hourly rate</Label>
                    <Input id="p-rate" inputMode="decimal" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.currentTarget.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="p-contract">Contract hours</Label>
                    <Input
                      id="p-contract"
                      inputMode="decimal"
                      value={draft.contract}
                      onChange={(e) => setDraft({ ...draft, contract: e.currentTarget.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="p-max">Weekly cap</Label>
                    <Input id="p-max" inputMode="decimal" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.currentTarget.value })} />
                  </div>
                </div>
              </div>

              <DialogFooter>
                {draft.id && (
                  <Button
                    variant="danger"
                    className="mr-auto"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void api
                        .deleteEmployee(draft.id as string)
                        .then(() => {
                          setDraft(null);
                          return load();
                        })
                        .catch((err: unknown) => onError(err instanceof Error ? err.message : String(err)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <Trash2 /> Remove
                  </Button>
                )}
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" variant="primary" disabled={busy}>
                  {draft.id ? "Save" : "Add to roster"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function AvailabilityEditor({
  employeeId,
  windows,
  busy,
  onChanged,
  onError,
  setBusy,
}: {
  employeeId: string;
  windows: Availability[];
  busy: boolean;
  onChanged: () => void;
  onError: (m: string) => void;
  setBusy: (b: boolean) => void;
}) {
  const [weekday, setWeekday] = useState("0");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [kind, setKind] = useState("unavailable");

  async function add() {
    const start = parseClock(from);
    const end = parseClock(to);
    if (start === null || end === null) return onError("Times read as 09:00 or 9.");
    setBusy(true);
    try {
      await api.addAvailability(employeeId, { weekday: Number(weekday), start_min: start, end_min: end, kind });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      {windows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing recorded. Anything added here blocks assignment and shows up as a conflict before the week is published.
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-border">
          {windows.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">
                <span className="font-medium">{DAY_FULL[w.weekday]}</span>{" "}
                <span className="tnum text-muted">
                  {clock(w.start_min)}–{clock(w.end_min)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={w.kind === "unavailable" ? "danger" : "info"}>
                  {w.kind === "unavailable" ? "Cannot work" : "Would rather not"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove this window"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void api
                      .dropAvailability(w.id)
                      .then(onChanged)
                      .catch((err: unknown) => onError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <Trash2 />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`day-${employeeId}`}>Day</Label>
          <Select value={weekday} onValueChange={setWeekday}>
            <SelectTrigger id={`day-${employeeId}`} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_FULL.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`from-${employeeId}`}>From</Label>
          <Input id={`from-${employeeId}`} className="w-24" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`to-${employeeId}`}>To</Label>
          <Input id={`to-${employeeId}`} className="w-24" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`kind-${employeeId}`}>Strength</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id={`kind-${employeeId}`} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unavailable">Cannot work</SelectItem>
              <SelectItem value="preferred">Would rather not</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="secondary" onClick={() => void add()} disabled={busy}>
          <Plus /> Add window
        </Button>
      </div>
    </div>
  );
}
