// Clocking in and out, and what that cost against what was planned.
//
// Deliberately plain. The loudest first-hand complaint in this whole category
// is that the punch does not go through, so this is two integers and a status,
// with nothing clever in between to fail.

import { caller, createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { DATE, fail, now, ok, OkSchema, paginate, PaginationQuery, uid, type App } from "../env.js";
import { clock, shiftHours, round1 } from "../schedule.js";

const EntrySchema = z
  .object({
    id: z.string(),
    employee_id: z.string(),
    employee_name: z.string(),
    shift_id: z.string().nullable(),
    date: z.string(),
    clock_in: z.number(),
    clock_out: z.number().nullable(),
    break_min: z.number(),
    source: z.string(),
    status: z.string(),
    note: z.string(),
    /** Paid hours once clocked out; 0 while still running. */
    hours: z.number(),
    /** Hours the shift was scheduled for, when this was worked against one. */
    scheduled_hours: z.number().nullable(),
    /** Worked minus scheduled. Positive is unplanned time on the clock. */
    variance_hours: z.number().nullable(),
    created_at: z.string(),
  })
  .openapi("TimeEntry");

/** Paid hours for an entry, with a night shift read as crossing midnight. */
function entryHours(e: { clock_in: number; clock_out: number | null; break_min: number }): number {
  if (e.clock_out === null) return 0;
  return shiftHours({ start_min: e.clock_in, end_min: e.clock_out, break_min: e.break_min });
}

export function registerTimeclock(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/time-entries",
    tags: ["Time clock"],
    summary: "The timesheet, newest first",
    request: {
      query: PaginationQuery.extend({
        status: z.string().optional(),
        from: z.string().optional().openapi({ description: "First date, YYYY-MM-DD" }),
        to: z.string().optional().openapi({ description: "Last date, YYYY-MM-DD" }),
      }),
    },
    responses: {
      200: ok(
        "A page of entries",
        z.object({
          items: z.array(EntrySchema),
          total: z.number(),
          page: z.number(),
          limit: z.number(),
          on_clock: z.number().openapi({ description: "How many people are clocked in right now" }),
        }),
      ),
      403: fail("No organisation"),
    },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const q = c.req.valid("query");
    const { limit, offset, page } = paginate(q);

    const where = ["t.org_id = ?"];
    const args: unknown[] = [org];
    if (q.status) {
      where.push("t.status = ?");
      args.push(q.status);
    }
    if (q.from && DATE.test(q.from)) {
      where.push("t.date >= ?");
      args.push(q.from);
    }
    if (q.to && DATE.test(q.to)) {
      where.push("t.date <= ?");
      args.push(q.to);
    }
    const clause = where.join(" AND ");

    const total = ((await get(`SELECT COUNT(*) AS n FROM time_entries t WHERE ${clause}`, args)) as { n: number } | null)?.n ?? 0;
    const onClock =
      ((await get(`SELECT COUNT(*) AS n FROM time_entries WHERE org_id = ? AND clock_out IS NULL`, [org])) as { n: number } | null)?.n ?? 0;

    const rows = (await query(
      `SELECT t.*, COALESCE(e.name, 'Removed') AS employee_name,
              s.start_min AS sched_start, s.end_min AS sched_end, s.break_min AS sched_break
         FROM time_entries t
         LEFT JOIN employees e ON e.id = t.employee_id
         LEFT JOIN shifts s ON s.id = t.shift_id
        WHERE ${clause} ORDER BY t.date DESC, t.clock_in DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    )) as unknown as (Record<string, unknown> & {
      clock_in: number;
      clock_out: number | null;
      break_min: number;
      sched_start: number | null;
      sched_end: number | null;
      sched_break: number | null;
    })[];

    const items = rows.map((r) => {
      const hours = round1(entryHours(r));
      const scheduled =
        r.sched_start !== null && r.sched_end !== null
          ? round1(shiftHours({ start_min: r.sched_start, end_min: r.sched_end, break_min: r.sched_break ?? 0 }))
          : null;
      return {
        ...r,
        hours,
        scheduled_hours: scheduled,
        variance_hours: scheduled !== null && r.clock_out !== null ? round1(hours - scheduled) : null,
      };
    });

    return c.json({ items, total, page, limit, on_clock: onClock } as never);
  });

  const clockIn = createRoute({
    method: "post",
    path: "/api/time-entries/clock-in",
    tags: ["Time clock"],
    summary: "Start someone's clock",
    description: "Answers with the existing entry if they are already on the clock, rather than opening a second one.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              employee_id: z.string(),
              shift_id: z.string().nullable().default(null),
              date: z.string().regex(DATE).optional(),
              at_min: z.number().int().min(0).max(1440).optional().openapi({ description: "Minutes past midnight. Defaults to now." }),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The open entry", EntrySchema), 403: fail("No organisation") },
  });

  app.openapi(clockIn, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");

    // Already running: hand back what is there. A second open entry is how a
    // timesheet ends up paying someone twice for one shift.
    const open = (await get(`SELECT id FROM time_entries WHERE org_id = ? AND employee_id = ? AND clock_out IS NULL`, [
      org,
      b.employee_id,
    ])) as { id: string } | null;
    if (open) return c.json((await oneEntry(org, open.id)) as never);

    const at = new Date();
    const id = uid();
    const ts = now();
    await run(
      `INSERT INTO time_entries (id, org_id, employee_id, shift_id, date, clock_in, clock_out, break_min, source, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, 'open', '', ?, ?)`,
      [
        id,
        org,
        b.employee_id,
        b.shift_id,
        b.date ?? at.toISOString().slice(0, 10),
        b.at_min ?? at.getHours() * 60 + at.getMinutes(),
        caller(c) === "agent" ? "agent" : "app",
        ts,
        ts,
      ],
    );
    return c.json((await oneEntry(org, id)) as never);
  });

  const clockOut = createRoute({
    method: "post",
    path: "/api/time-entries/clock-out",
    tags: ["Time clock"],
    summary: "Stop someone's clock",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              employee_id: z.string(),
              at_min: z.number().int().min(0).max(1440).optional(),
              break_min: z.number().int().min(0).max(600).default(0),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The closed entry", EntrySchema), 404: fail("Nobody on the clock"), 403: fail("No organisation") },
  });

  app.openapi(clockOut, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const open = (await get(`SELECT id FROM time_entries WHERE org_id = ? AND employee_id = ? AND clock_out IS NULL`, [
      org,
      b.employee_id,
    ])) as { id: string } | null;
    if (!open) return c.json({ error: "That person is not on the clock" }, 404);

    const at = new Date();
    await run(`UPDATE time_entries SET clock_out = ?, break_min = ?, status = 'pending', updated_at = ? WHERE id = ? AND org_id = ?`, [
      b.at_min ?? at.getHours() * 60 + at.getMinutes(),
      b.break_min,
      now(),
      open.id,
      org,
    ]);
    return c.json((await oneEntry(org, open.id)) as never);
  });

  const edit = createRoute({
    method: "patch",
    path: "/api/time-entries/{id}",
    tags: ["Time clock"],
    summary: "Correct an entry, or approve it for payroll",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              clock_in: z.number().int().min(0).max(1440).optional(),
              clock_out: z.number().int().min(0).max(1440).nullable().optional(),
              break_min: z.number().int().min(0).max(600).optional(),
              status: z.enum(["open", "pending", "approved"]).optional(),
              note: z.string().max(500).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The entry", EntrySchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(edit, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const found = await get(`SELECT id FROM time_entries WHERE id = ? AND org_id = ?`, [id, org]);
    if (!found) return c.json({ error: "No such entry" }, 404);

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ["clock_in", "break_min", "status", "note"] as const) {
      if (b[key] !== undefined) {
        sets.push(`${key} = ?`);
        args.push(b[key]);
      }
    }
    if (b.clock_out !== undefined) {
      sets.push("clock_out = ?");
      args.push(b.clock_out);
    }
    if (sets.length) {
      sets.push("source = 'manual'", "updated_at = ?");
      args.push(now(), id, org);
      await run(`UPDATE time_entries SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`, args);
    }
    return c.json((await oneEntry(org, id)) as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/time-entries/{id}",
    tags: ["Time clock"],
    summary: "Delete an entry",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    await run(`DELETE FROM time_entries WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });
}

async function oneEntry(org: string, id: string) {
  const r = (await get(
    `SELECT t.*, COALESCE(e.name, 'Removed') AS employee_name,
            s.start_min AS sched_start, s.end_min AS sched_end, s.break_min AS sched_break
       FROM time_entries t
       LEFT JOIN employees e ON e.id = t.employee_id
       LEFT JOIN shifts s ON s.id = t.shift_id
      WHERE t.id = ? AND t.org_id = ?`,
    [id, org],
  )) as
    | (Record<string, unknown> & {
        clock_in: number;
        clock_out: number | null;
        break_min: number;
        sched_start: number | null;
        sched_end: number | null;
        sched_break: number | null;
      })
    | null;
  if (!r) return null;
  const hours = round1(entryHours(r));
  const scheduled =
    r.sched_start !== null && r.sched_end !== null
      ? round1(shiftHours({ start_min: r.sched_start, end_min: r.sched_end, break_min: r.sched_break ?? 0 }))
      : null;
  return {
    ...r,
    hours,
    scheduled_hours: scheduled,
    variance_hours: scheduled !== null && r.clock_out !== null ? round1(hours - scheduled) : null,
  };
}

export { clock };
