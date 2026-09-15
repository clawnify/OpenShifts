// What the rota is costing, and how often it is being changed after it was
// promised. The second number is the one no vendor reports on itself.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query } from "../db.js";
import { fail, ok, type App } from "../env.js";
import { addDays, round1, weekStartOf } from "../schedule.js";
import { readSettings } from "./settings.js";

const InsightsSchema = z
  .object({
    weeks: z.array(
      z.object({
        week_start: z.string(),
        published_at: z.string().nullable(),
        budget: z.number(),
        shifts: z.number(),
        open_shifts: z.number(),
        /** Entries written after the week was published. */
        late_changes: z.number(),
        /** Of those, the ones made with less than 24 hours' notice. */
        short_notice: z.number(),
      }),
    ),
    /** Across the window: how reliable the published rota actually was. */
    reliability: z.object({
      published_weeks: z.number(),
      late_changes: z.number(),
      short_notice: z.number(),
      /** Median hours of notice on changes to published weeks. Null with no data. */
      median_notice_hours: z.number().nullable(),
    }),
    top_hours: z.array(z.object({ employee_id: z.string(), name: z.string(), hours: z.number() })),
    currency: z.string(),
  })
  .openapi("Insights");

export function registerInsights(app: App) {
  const read = createRoute({
    method: "get",
    path: "/api/insights",
    tags: ["Insights"],
    summary: "Cost, coverage, and how often published weeks were changed",
    description:
      "Defaults to the last eight weeks. `reliability` is the app's own scorecard: a published rota that keeps moving is the thing the people working it complain about, so it is measured rather than assumed.",
    request: {
      query: z.object({
        weeks: z.string().optional().openapi({ description: "How many weeks back (default 8, max 26)" }),
      }),
    },
    responses: { 200: ok("The numbers", InsightsSchema), 403: fail("No organisation") },
  });

  app.openapi(read, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const settings = await readSettings(org);

    const span = Math.min(26, Math.max(1, Number(c.req.valid("query").weeks) || 8));
    const thisWeek = weekStartOf(new Date().toISOString().slice(0, 10));
    const from = addDays(thisWeek, -7 * (span - 1));

    // One row per week. Bounded by `span`, which is capped at 26.
    const weekRows = (await query(
      `SELECT week_start, published_at, budget FROM weeks
        WHERE org_id = ? AND week_start >= ? AND week_start <= ?
        ORDER BY week_start DESC LIMIT 26`,
      [org, from, thisWeek],
    )) as unknown as { week_start: string; published_at: string | null; budget: number }[];

    // Grouped aggregates rather than a query per week, so the number of
    // statements does not grow with the window.
    const shiftCounts = (await query(
      `SELECT week_start, COUNT(*) AS n, SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) AS open
         FROM shifts WHERE org_id = ? AND week_start >= ? AND week_start <= ?
        GROUP BY week_start`,
      [org, from, thisWeek],
    )) as unknown as { week_start: string; n: number; open: number }[];

    const changeCounts = (await query(
      `SELECT week_start,
              COUNT(*) AS n,
              SUM(CASE WHEN notice_hours IS NOT NULL AND notice_hours < 24 THEN 1 ELSE 0 END) AS short
         FROM changes
        WHERE org_id = ? AND week_start >= ? AND week_start <= ?
          AND kind IN ('added', 'removed', 'reassigned', 'retimed')
        GROUP BY week_start`,
      [org, from, thisWeek],
    )) as unknown as { week_start: string; n: number; short: number }[];

    const shiftsBy = new Map(shiftCounts.map((r) => [r.week_start, r]));
    const changesBy = new Map(changeCounts.map((r) => [r.week_start, r]));

    const weeks = weekRows.map((w) => ({
      week_start: w.week_start,
      published_at: w.published_at,
      budget: w.budget,
      shifts: shiftsBy.get(w.week_start)?.n ?? 0,
      open_shifts: shiftsBy.get(w.week_start)?.open ?? 0,
      late_changes: w.published_at ? (changesBy.get(w.week_start)?.n ?? 0) : 0,
      short_notice: w.published_at ? (changesBy.get(w.week_start)?.short ?? 0) : 0,
    }));

    const notices = (await query(
      `SELECT notice_hours FROM changes
        WHERE org_id = ? AND week_start >= ? AND notice_hours IS NOT NULL
          AND kind IN ('removed', 'reassigned', 'retimed')
        ORDER BY notice_hours LIMIT 1000`,
      [org, from],
    )) as unknown as { notice_hours: number }[];

    const median = notices.length ? round1(notices[Math.floor(notices.length / 2)].notice_hours) : null;

    const topHours = (await query(
      `SELECT s.employee_id, e.name,
              SUM((CASE WHEN s.end_min > s.start_min THEN s.end_min - s.start_min ELSE s.end_min + 1440 - s.start_min END) - s.break_min) / 60.0 AS hours
         FROM shifts s JOIN employees e ON e.id = s.employee_id
        WHERE s.org_id = ? AND s.week_start >= ? AND s.employee_id IS NOT NULL
        GROUP BY s.employee_id, e.name ORDER BY hours DESC LIMIT 10`,
      [org, from],
    )) as unknown as { employee_id: string; name: string; hours: number }[];

    return c.json({
      weeks,
      reliability: {
        published_weeks: weeks.filter((w) => w.published_at).length,
        late_changes: weeks.reduce((n, w) => n + w.late_changes, 0),
        short_notice: weeks.reduce((n, w) => n + w.short_notice, 0),
        median_notice_hours: median,
      },
      top_hours: topHours.map((r) => ({ ...r, hours: round1(r.hours) })),
      currency: settings.currency,
    } as never);
  });

  const summary = createRoute({
    method: "get",
    path: "/api/summary",
    tags: ["Insights"],
    summary: "One screen with everything that needs a decision. Screenshot-friendly.",
    responses: {
      200: ok(
        "The state of play",
        z.object({
          business_name: z.string(),
          this_week: z.string(),
          published: z.boolean(),
          shifts: z.number(),
          open_shifts: z.number(),
          pending_time_off: z.number(),
          pending_swaps: z.number(),
          on_clock: z.number(),
          unapproved_entries: z.number(),
          active_people: z.number(),
        }),
      ),
      403: fail("No organisation"),
    },
  });

  app.openapi(summary, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const settings = await readSettings(org);
    const week = weekStartOf(new Date().toISOString().slice(0, 10));
    const one = async (sql: string, args: unknown[]) => ((await get(sql, args)) as { n: number } | null)?.n ?? 0;

    return c.json({
      business_name: settings.business_name,
      this_week: week,
      published: Boolean(
        ((await get(`SELECT published_at FROM weeks WHERE org_id = ? AND week_start = ?`, [org, week])) as
          | { published_at: string | null }
          | null)?.published_at,
      ),
      shifts: await one(`SELECT COUNT(*) AS n FROM shifts WHERE org_id = ? AND week_start = ?`, [org, week]),
      open_shifts: await one(`SELECT COUNT(*) AS n FROM shifts WHERE org_id = ? AND week_start = ? AND employee_id IS NULL`, [org, week]),
      pending_time_off: await one(`SELECT COUNT(*) AS n FROM time_off WHERE org_id = ? AND status = 'pending'`, [org]),
      pending_swaps: await one(`SELECT COUNT(*) AS n FROM swaps WHERE org_id = ? AND status = 'pending'`, [org]),
      on_clock: await one(`SELECT COUNT(*) AS n FROM time_entries WHERE org_id = ? AND clock_out IS NULL`, [org]),
      unapproved_entries: await one(`SELECT COUNT(*) AS n FROM time_entries WHERE org_id = ? AND status = 'pending'`, [org]),
      active_people: await one(`SELECT COUNT(*) AS n FROM employees WHERE org_id = ? AND active = 1`, [org]),
    } as never);
  });
}
