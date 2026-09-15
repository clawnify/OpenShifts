// Cost and coverage, plus the app's own scorecard.
//
// `reliability` measures how often published weeks were changed and how much
// notice people got. It is deliberately a number this app reports on itself,
// because the alternative is a product that quietly gets worse at the one thing
// it promises.

import { useCallback, useEffect, useState } from "react";
import { Card, Empty, Skeleton, Tile, Toolbar } from "./shell";
import { api, type Insights as InsightsData } from "../api";
import { hours, longDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Insights({ onError }: { onError: (m: string) => void }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.insights(8));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const r = data?.reliability;
  const maxHours = Math.max(1, ...(data?.top_hours ?? []).map((t) => t.hours));

  return (
    <>
      <Toolbar
        title="Insights"
        subtitle="The last eight weeks: what they cost, what stayed uncovered, and how often a published week moved."
        view={<span className="text-[0.8125rem] font-medium text-muted">Last 8 weeks</span>}
      />

      <div className="space-y-6 p-6">
        {loading ? (
          <Skeleton rows={6} />
        ) : !data || data.weeks.length === 0 ? (
          <Empty
            title="Nothing to measure yet"
            body="Build and publish a week on the schedule. Once a week has been published, this page starts tracking what it cost and whether it stayed put."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Tile label="Weeks published" value={r?.published_weeks ?? 0} meta="in this window" />
              <Tile
                label="Changed after publish"
                value={r?.late_changes ?? 0}
                meta={r?.late_changes ? "edits people had to be told about" : "none"}
                tone={r?.late_changes ? "warning" : "success"}
              />
              <Tile
                label="Under 24h notice"
                value={r?.short_notice ?? 0}
                meta={r?.short_notice ? "the ones that hurt" : "none"}
                tone={r?.short_notice ? "danger" : "success"}
              />
              <Tile
                label="Median notice"
                value={r?.median_notice_hours === null || r?.median_notice_hours === undefined ? "—" : `${r.median_notice_hours}h`}
                meta="on changes to published weeks"
              />
            </div>

            <Card title="Week by week" subtitle="Shifts, coverage, and edits made after the week was promised.">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 text-[0.8125rem] font-medium text-muted">Week</th>
                    <th scope="col" className="py-2 text-[0.8125rem] font-medium text-muted">State</th>
                    <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Shifts</th>
                    <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Left open</th>
                    <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Changed after</th>
                    <th scope="col" className="py-2 text-right text-[0.8125rem] font-medium text-muted">Under 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w) => (
                    <tr key={w.week_start} className="border-b border-border">
                      <td className="tnum py-2.5 text-sm">{longDate(w.week_start)}</td>
                      <td className="py-2.5 text-sm text-muted">{w.published_at ? "Published" : "Draft"}</td>
                      <td className="tnum py-2.5 text-right text-sm">{w.shifts}</td>
                      <td className={cn("tnum py-2.5 text-right text-sm", w.open_shifts > 0 && "text-warning")}>{w.open_shifts}</td>
                      <td className={cn("tnum py-2.5 text-right text-sm", w.late_changes > 0 && "text-warning")}>{w.late_changes}</td>
                      <td className={cn("tnum py-2.5 text-right text-sm", w.short_notice > 0 && "text-danger")}>{w.short_notice}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="py-2.5 text-[0.8125rem] font-medium text-muted">Total</td>
                    <td className="tnum py-2.5 text-right text-sm font-semibold">{data.weeks.reduce((n, w) => n + w.shifts, 0)}</td>
                    <td className="tnum py-2.5 text-right text-sm font-semibold">{data.weeks.reduce((n, w) => n + w.open_shifts, 0)}</td>
                    <td className="tnum py-2.5 text-right text-sm font-semibold">{data.weeks.reduce((n, w) => n + w.late_changes, 0)}</td>
                    <td className="tnum py-2.5 text-right text-sm font-semibold">{data.weeks.reduce((n, w) => n + w.short_notice, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>

            <Card title="Hours by person" subtitle="Across the same window. The bar is relative to whoever worked most.">
              {data.top_hours.length === 0 ? (
                <p className="py-2 text-sm text-muted">No assigned shifts in this window.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.top_hours.map((t) => (
                    <li key={t.employee_id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm">{t.name}</span>
                        <span className="tnum text-sm font-medium">{hours(t.hours)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full bg-info-solid" style={{ width: `${(t.hours / maxHours) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

export { money };
