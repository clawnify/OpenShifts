// The rules the schedule is judged against, and the link the team opens.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Skeleton, Toolbar } from "./shell";
import { api, type Settings as SettingsData } from "../api";

export function Settings({ onError, onSaved }: { onError: (m: string) => void; onSaved: () => void }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api.settings(), api.shareLink()]);
      setData(s);
      setLink(l.url);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Partial<Omit<SettingsData, "show_changes">> & { show_changes?: boolean }) {
    setBusy(true);
    try {
      setData(await api.saveSettings(body));
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <>
        <Toolbar title="Settings" />
        <div className="p-6">
          <Skeleton rows={4} />
        </div>
      </>
    );
  }

  return (
    <>
      <Toolbar title="Settings" subtitle="The rules every week is checked against, and the link your team opens." />

      <div className="max-w-3xl space-y-6 p-6">
        <Card title="Business" subtitle="The name at the top of the team's schedule page.">
          <div className="grid max-w-sm gap-1.5">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              defaultValue={data.business_name}
              placeholder="The Harbour Cafe"
              onBlur={(e) => void patch({ business_name: e.currentTarget.value })}
            />
          </div>
        </Card>

        <Card
          title="Scheduling rules"
          subtitle="A shift that breaks one of these raises a conflict on the grid before the week goes out."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-rest">Minimum rest between shifts</Label>
              <Input
                id="s-rest"
                inputMode="decimal"
                defaultValue={String(data.min_rest_hours)}
                onBlur={(e) => void patch({ min_rest_hours: Number(e.currentTarget.value) || 0 })}
              />
              <p className="text-xs text-muted">Hours. 11 is the EU daily rest, and what catches a close followed by an open.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-ot">Overtime after</Label>
              <Input
                id="s-ot"
                inputMode="decimal"
                defaultValue={String(data.overtime_after)}
                onBlur={(e) => void patch({ overtime_after: Number(e.currentTarget.value) || 0 })}
              />
              <p className="text-xs text-muted">Hours in a week. 0 turns the overtime rate off.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-otr">Overtime rate</Label>
              <Input
                id="s-otr"
                inputMode="numeric"
                defaultValue={String(data.overtime_rate)}
                onBlur={(e) => void patch({ overtime_rate: Number(e.currentTarget.value) || 100 })}
              />
              <p className="text-xs text-muted">Hundredths. 150 pays time and a half.</p>
            </div>
          </div>

          <div className="mt-4 grid max-w-xs gap-1.5">
            <Label htmlFor="s-cur">Currency</Label>
            <Select value={data.currency} onValueChange={(v) => void patch({ currency: v })}>
              <SelectTrigger id="s-cur">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["EUR", "GBP", "USD", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card title="The team's link" subtitle="One stable URL. No login, read-only, and it only ever shows published weeks.">
          <p className="tnum break-all rounded-sm bg-sunken px-3 py-2 text-sm">{link || "Not issued yet"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(link)} disabled={!link}>
              Copy link
            </Button>
            <Button variant="secondary" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                Open it
              </a>
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
              <RefreshCw /> Issue a new link
            </Button>
          </div>

          <label className="mt-4 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-accent"
              checked={data.show_changes === 1}
              onChange={(e) => void patch({ show_changes: e.currentTarget.checked })}
            />
            <span>
              Show the change log on the team's page
              <span className="mt-0.5 block text-xs text-muted">
                Every edit made after a week was published, with who made it. Turning this off hides it from the team but keeps recording it.
              </span>
            </span>
          </label>
        </Card>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Issue a new team link?</DialogTitle>
            <DialogDescription>
              The current URL stops working immediately, for everyone who has it. You will need to send the new one to the team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Keep the current link</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api
                  .rotateLink()
                  .then(() => {
                    setConfirming(false);
                    return load();
                  })
                  .catch((err: unknown) => onError(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              Issue a new link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
