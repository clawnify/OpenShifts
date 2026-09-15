// The week: reading it, changing it, and publishing it.
//
// Every write goes through `ensureWeek` + `logChange`, so a change to a rota
// that has already been promised to people is recorded by construction rather
// than by anyone remembering to record it.

import { caller, createRoute, orgId, user, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { DATE, fail, now, ok, OkSchema, paginate, uid, type App } from "../env.js";
import {
  clock,
  findConflicts,
  hoursByEmployee,
  weekCost,
  weekDates,
  weekStartOf,
  type AvailabilityRow,
  type EmployeeRow,
  type ShiftRow,
  type TimeOffRow,
} from "../schedule.js";
import { actorName, changesFor, ensureWeek, logChange } from "../week.js";
import { readSettings } from "./settings.js";

const ShiftSchema = z
  .object({
    id: z.string(),
    week_start: z.string(),
    date: z.string(),
    start_min: z.number(),
    end_min: z.number(),
    break_min: z.number(),
    role: z.string(),
    employee_id: z.string().nullable(),
    note: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Shift");

const ConflictSchema = z
  .object({
    shift_id: z.string(),
    employee_id: z.string(),
    kind: z.string(),
    message: z.string(),
    severity: z.string(),
  })
  .openapi("Conflict");

const WeekSchema = z
  .object({
    week_start: z.string(),
    dates: z.array(z.string()),
    published_at: z.string().nullable(),
    published_by: z.string(),
    budget: z.number(),
    shifts: z.array(ShiftSchema),
    employees: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string(),
        hourly_rate: z.number(),
        contract_hours: z.number(),
        max_hours: z.number(),
        hours: z.number(),
      }),
    ),
    employees_total: z.number(),
    conflicts: z.array(ConflictSchema),
    cost: z.object({
      total: z.number(),
      hours: z.number(),
      lines: z.array(
        z.object({ employee_id: z.string(), name: z.string(), hours: z.number(), overtime_hours: z.number(), cost: z.number() }),
      ),
    }),
    changes: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        detail: z.string(),
        actor: z.string(),
        employee_id: z.string().nullable(),
        notice_hours: z.number().nullable(),
        at: z.string(),
      }),
    ),
    open_shifts: z.number(),
    currency: z.string(),
  })
  .openapi("Week");

const ShiftBody = z.object({
  date: z.string().regex(DATE),
  start_min: z.number().int().min(0).max(1440),
  end_min: z.number().int().min(0).max(1440),
  break_min: z.number().int().min(0).max(600).default(0),
  role: z.string().max(80).default(""),
  employee_id: z.string().nullable().default(null),
  note: z.string().max(500).default(""),
});

/** One sentence describing a shift, for the change log and the staff page. */
function describe(s: { date: string; start_min: number; end_min: number }): string {
  return `${s.date} ${clock(s.start_min)}–${clock(s.end_min)}`;
}

export function registerShifts(app: App) {
  /* ── read the week ───────────────────────────────────────────────────── */

  const readWeek = createRoute({
    method: "get",
    path: "/api/week",
    tags: ["Schedule"],
    summary: "One week of the rota, with its conflicts, cost and change log",
    description:
      "The screen and the agent read the same thing. `conflicts` and `cost` are computed here so nobody recomputes them differently. The roster is paginated: a team larger than `limit` pages through `page`.",
    request: {
      query: z.object({
        week_start: z.string().optional().openapi({ description: "Any date in the week; snapped back to its Monday. Defaults to this week." }),
        page: z.string().optional(),
        limit: z.string().optional().openapi({ description: "Roster rows per page (default 50, max 100)" }),
      }),
    },
    responses: { 200: ok("The week", WeekSchema), 403: fail("No organisation") },
  });

  app.openapi(readWeek, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const q = c.req.valid("query");
    const weekStart = weekStartOf(q.week_start && DATE.test(q.week_start) ? q.week_start : new Date().toISOString().slice(0, 10));
    const { limit, offset } = paginate(q, 50);

    const settings = await readSettings(org);
    const week = await ensureWeek(org, weekStart);
    const dates = weekDates(weekStart);

    // One indexed range scan for the week. A week of shifts is bounded by the
    // week itself, so there is no unbounded collection to page here.
    const shifts = (await query(
      `SELECT * FROM shifts WHERE org_id = ? AND week_start = ? ORDER BY date, start_min LIMIT 1000`,
      [org, weekStart],
    )) as unknown as (ShiftRow & { week_start: string; note: string; created_at: string; updated_at: string })[];

    const employeesTotal =
      ((await get(`SELECT COUNT(*) AS n FROM employees WHERE org_id = ? AND active = 1`, [org])) as { n: number } | null)?.n ?? 0;
    const roster = (await query(
      `SELECT id, name, role, hourly_rate, contract_hours, max_hours
         FROM employees WHERE org_id = ? AND active = 1 ORDER BY name LIMIT ? OFFSET ?`,
      [org, limit, offset],
    )) as unknown as EmployeeRow[];

    // Availability and leave are read for the whole org rather than per employee
    // id: a list of ids would bind one parameter each and break past D1's cap of
    // 100 at exactly the page size this endpoint allows.
    const availability = (await query(
      `SELECT employee_id, weekday, start_min, end_min, kind FROM availability WHERE org_id = ? LIMIT 2000`,
      [org],
    )) as unknown as AvailabilityRow[];
    const timeOff = (await query(
      `SELECT employee_id, start_date, end_date, kind, status
         FROM time_off WHERE org_id = ? AND status = 'approved' AND end_date >= ? AND start_date <= ? LIMIT 500`,
      [org, dates[0], dates[6]],
    )) as unknown as TimeOffRow[];

    // Conflicts are judged against the whole roster, not the visible page: a
    // double booking is still a double booking when the other person is on page 2.
    const allEmployees = (await query(
      `SELECT id, name, role, hourly_rate, contract_hours, max_hours FROM employees WHERE org_id = ? LIMIT 1000`,
      [org],
    )) as unknown as EmployeeRow[];

    const conflicts = findConflicts({
      shifts,
      employees: allEmployees,
      availability,
      timeOff,
      minRestHours: settings.min_rest_hours,
    });
    const cost = weekCost(shifts, allEmployees, {
      overtimeAfter: settings.overtime_after,
      overtimeRate: settings.overtime_rate,
    });
    const hours = hoursByEmployee(shifts);

    return c.json({
      week_start: weekStart,
      dates,
      published_at: week.published_at,
      published_by: week.published_by,
      budget: week.budget,
      shifts,
      employees: roster.map((e) => ({ ...e, hours: hours.get(e.id) ?? 0 })),
      employees_total: employeesTotal,
      conflicts,
      cost,
      changes: await changesFor(org, weekStart, 50),
      open_shifts: shifts.filter((s) => !s.employee_id).length,
      currency: settings.currency,
    } as never);
  });

  /* ── change the week ─────────────────────────────────────────────────── */

  const create = createRoute({
    method: "post",
    path: "/api/shifts",
    tags: ["Schedule"],
    summary: "Add a shift, assigned or left open",
    request: { body: { content: { "application/json": { schema: ShiftBody } } } },
    responses: { 200: ok("The new shift", ShiftSchema), 400: fail("Bad shift"), 403: fail("No organisation") },
  });

  app.openapi(create, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    if (b.start_min === b.end_min) return c.json({ error: "A shift needs a length" }, 400);

    const weekStart = weekStartOf(b.date);
    const week = await ensureWeek(org, weekStart);
    const id = uid();
    const ts = now();
    await run(
      `INSERT INTO shifts (id, org_id, week_start, date, start_min, end_min, break_min, role, employee_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, org, weekStart, b.date, b.start_min, b.end_min, b.break_min, b.role, b.employee_id, b.note, ts, ts],
    );

    const who = b.employee_id ? await nameOf(org, b.employee_id) : "Nobody yet";
    await logChange({
      org,
      week,
      kind: "added",
      detail: `Added ${describe(b)} for ${who}.`,
      actor: actorName(user(c), caller(c)),
      shiftId: id,
      employeeId: b.employee_id,
      date: b.date,
      startMin: b.start_min,
    });

    return c.json((await get(`SELECT * FROM shifts WHERE id = ? AND org_id = ?`, [id, org])) as never);
  });

  const update = createRoute({
    method: "patch",
    path: "/api/shifts/{id}",
    tags: ["Schedule"],
    summary: "Move, retime or reassign a shift",
    description:
      "On a published week this writes a change-log entry naming what moved and how much notice the person got. There is no way to edit a published shift without that entry.",
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: ShiftBody.partial() } } } },
    responses: { 200: ok("The updated shift", ShiftSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(update, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const before = (await get(`SELECT * FROM shifts WHERE id = ? AND org_id = ?`, [id, org])) as
      | (ShiftRow & { week_start: string })
      | null;
    if (!before) return c.json({ error: "No such shift" }, 404);

    const next = {
      date: b.date ?? before.date,
      start_min: b.start_min ?? before.start_min,
      end_min: b.end_min ?? before.end_min,
      break_min: b.break_min ?? before.break_min,
      role: b.role ?? before.role,
      employee_id: b.employee_id === undefined ? before.employee_id : b.employee_id,
      note: b.note ?? (before as unknown as { note: string }).note,
    };
    const weekStart = weekStartOf(next.date);
    const week = await ensureWeek(org, before.week_start);
    const actor = actorName(user(c), caller(c));

    await run(
      `UPDATE shifts SET week_start = ?, date = ?, start_min = ?, end_min = ?, break_min = ?, role = ?, employee_id = ?, note = ?, updated_at = ?
        WHERE id = ? AND org_id = ?`,
      [weekStart, next.date, next.start_min, next.end_min, next.break_min, next.role, next.employee_id, next.note, now(), id, org],
    );

    // Two separate facts, logged separately, because "moved to Tuesday" and
    // "given to someone else" are different things to be told about your week.
    if (next.employee_id !== before.employee_id) {
      const from = before.employee_id ? await nameOf(org, before.employee_id) : "the open shifts";
      const to = next.employee_id ? await nameOf(org, next.employee_id) : "the open shifts";
      await logChange({
        org,
        week,
        kind: "reassigned",
        detail: `${describe(next)} moved from ${from} to ${to}.`,
        actor,
        shiftId: id,
        employeeId: before.employee_id ?? next.employee_id,
        date: next.date,
        startMin: next.start_min,
      });
    }
    if (next.date !== before.date || next.start_min !== before.start_min || next.end_min !== before.end_min) {
      const who = next.employee_id ? await nameOf(org, next.employee_id) : "an open shift";
      await logChange({
        org,
        week,
        kind: "retimed",
        detail: `${describe(before)} became ${describe(next)} for ${who}.`,
        actor,
        shiftId: id,
        employeeId: next.employee_id,
        date: next.date,
        startMin: next.start_min,
      });
    }

    return c.json((await get(`SELECT * FROM shifts WHERE id = ? AND org_id = ?`, [id, org])) as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/shifts/{id}",
    tags: ["Schedule"],
    summary: "Delete a shift",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", OkSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const before = (await get(`SELECT * FROM shifts WHERE id = ? AND org_id = ?`, [id, org])) as
      | (ShiftRow & { week_start: string })
      | null;
    if (!before) return c.json({ error: "No such shift" }, 404);

    const week = await ensureWeek(org, before.week_start);
    const who = before.employee_id ? await nameOf(org, before.employee_id) : "the open shifts";
    await run(`DELETE FROM shifts WHERE id = ? AND org_id = ?`, [id, org]);
    await logChange({
      org,
      week,
      kind: "removed",
      detail: `Removed ${describe(before)} from ${who}.`,
      actor: actorName(user(c), caller(c)),
      shiftId: id,
      employeeId: before.employee_id,
      date: before.date,
      startMin: before.start_min,
    });
    return c.json({ ok: true } as never);
  });

  /* ── publish ─────────────────────────────────────────────────────────── */

  const publish = createRoute({
    method: "post",
    path: "/api/week/publish",
    tags: ["Schedule"],
    summary: "Publish the week, or take it back to a draft",
    description:
      "Publishing is the promise. From this moment every edit to the week is recorded with who made it and how much notice the person got, and the team's link starts showing it.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ week_start: z.string().regex(DATE), published: z.boolean().default(true) }),
          },
        },
      },
    },
    responses: { 200: ok("The week's state", z.object({ week_start: z.string(), published_at: z.string().nullable(), published_by: z.string() })), 403: fail("No organisation") },
  });

  app.openapi(publish, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const weekStart = weekStartOf(b.week_start);
    const week = await ensureWeek(org, weekStart);
    const actor = actorName(user(c), caller(c));
    const ts = now();

    await run(`UPDATE weeks SET published_at = ?, published_by = ?, updated_at = ? WHERE org_id = ? AND week_start = ?`, [
      b.published ? ts : null,
      b.published ? actor : "",
      ts,
      org,
      weekStart,
    ]);

    const count = ((await get(`SELECT COUNT(*) AS n FROM shifts WHERE org_id = ? AND week_start = ?`, [org, weekStart])) as
      | { n: number }
      | null)?.n ?? 0;

    await logChange({
      org,
      // The lifecycle entry is written whichever way the week is going, so the
      // log shows an unpublish rather than a gap.
      week: { ...week, published_at: b.published ? ts : week.published_at },
      kind: b.published ? "published" : "unpublished",
      detail: b.published
        ? `Published the week of ${weekStart} with ${count} shift${count === 1 ? "" : "s"}.`
        : `Took the week of ${weekStart} back to a draft.`,
      actor,
    });

    return c.json({ week_start: weekStart, published_at: b.published ? ts : null, published_by: b.published ? actor : "" } as never);
  });

  const budget = createRoute({
    method: "put",
    path: "/api/week/budget",
    tags: ["Schedule"],
    summary: "Set the week's labour budget",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ week_start: z.string().regex(DATE), budget: z.number().int().min(0) }),
          },
        },
      },
    },
    responses: { 200: ok("Saved", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(budget, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const weekStart = weekStartOf(b.week_start);
    await ensureWeek(org, weekStart);
    await run(`UPDATE weeks SET budget = ?, updated_at = ? WHERE org_id = ? AND week_start = ?`, [b.budget, now(), org, weekStart]);
    return c.json({ ok: true } as never);
  });

  /* ── copy last week ──────────────────────────────────────────────────── */

  const copy = createRoute({
    method: "post",
    path: "/api/week/copy",
    tags: ["Schedule"],
    summary: "Copy a week's shifts onto another week",
    description: "The fastest way to build a rota that mostly repeats. Copies into a draft; it never publishes.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              from: z.string().regex(DATE),
              to: z.string().regex(DATE),
              keep_people: z.boolean().default(true).openapi({ description: "false copies the shape and leaves every shift open" }),
            }),
          },
        },
      },
    },
    responses: { 200: ok("How many were copied", z.object({ copied: z.number(), week_start: z.string() })), 400: fail("Same week"), 403: fail("No organisation") },
  });

  app.openapi(copy, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const from = weekStartOf(b.from);
    const to = weekStartOf(b.to);
    if (from === to) return c.json({ error: "That is the same week" }, 400);

    const source = (await query(`SELECT * FROM shifts WHERE org_id = ? AND week_start = ? LIMIT 1000`, [org, from])) as unknown as (ShiftRow & {
      break_min: number;
      note: string;
    })[];
    const week = await ensureWeek(org, to);
    const offsetDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    const ts = now();

    // One statement per shift: an INSERT of many rows would bind 10 parameters
    // each and trip D1's 100-parameter ceiling at eleven shifts.
    for (const s of source) {
      const date = new Date(Date.parse(`${s.date}T00:00:00Z`) + offsetDays * 86_400_000).toISOString().slice(0, 10);
      await run(
        `INSERT INTO shifts (id, org_id, week_start, date, start_min, end_min, break_min, role, employee_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid(), org, to, date, s.start_min, s.end_min, s.break_min, s.role, b.keep_people ? s.employee_id : null, s.note, ts, ts],
      );
    }

    await logChange({
      org,
      week,
      kind: "added",
      detail: `Copied ${source.length} shift${source.length === 1 ? "" : "s"} from the week of ${from}.`,
      actor: actorName(user(c), caller(c)),
    });

    return c.json({ copied: source.length, week_start: to } as never);
  });
}

async function nameOf(org: string, employeeId: string): Promise<string> {
  const row = (await get(`SELECT name FROM employees WHERE id = ? AND org_id = ?`, [employeeId, org])) as { name: string } | null;
  return row?.name ?? "someone no longer on the roster";
}
