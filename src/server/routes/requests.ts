// The inbox: time off, and shifts changing hands.
//
// A swap here is a record with a decision and a timestamp, not a message in a
// chat. That is the whole difference: afterwards, somebody can say who agreed
// to what and when.

import { caller, createRoute, orgId, user, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { DATE, fail, now, ok, OkSchema, paginate, PaginationQuery, uid, type App } from "../env.js";
import { clock, weekStartOf, weekdayOf } from "../schedule.js";
import { actorName, ensureWeek, logChange } from "../week.js";

const TimeOffSchema = z
  .object({
    id: z.string(),
    employee_id: z.string(),
    employee_name: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    kind: z.string(),
    status: z.string(),
    note: z.string(),
    created_at: z.string(),
    decided_at: z.string().nullable(),
  })
  .openapi("TimeOff");

const SwapSchema = z
  .object({
    id: z.string(),
    shift_id: z.string(),
    from_employee_id: z.string().nullable(),
    from_name: z.string(),
    to_employee_id: z.string().nullable(),
    to_name: z.string(),
    status: z.string(),
    reason: z.string(),
    shift_label: z.string(),
    created_at: z.string(),
    decided_at: z.string().nullable(),
    decided_by: z.string(),
  })
  .openapi("Swap");

export function registerRequests(app: App) {
  /* ── time off ────────────────────────────────────────────────────────── */

  const listOff = createRoute({
    method: "get",
    path: "/api/time-off",
    tags: ["Requests"],
    summary: "Time-off requests, newest first",
    request: { query: PaginationQuery.extend({ status: z.string().optional() }) },
    responses: {
      200: ok("A page of requests", z.object({ items: z.array(TimeOffSchema), total: z.number(), page: z.number(), limit: z.number() })),
      403: fail("No organisation"),
    },
  });

  app.openapi(listOff, async (c) => {
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
    const clause = where.join(" AND ");
    const total = ((await get(`SELECT COUNT(*) AS n FROM time_off t WHERE ${clause}`, args)) as { n: number } | null)?.n ?? 0;
    const items = await query(
      `SELECT t.*, COALESCE(e.name, 'Removed') AS employee_name
         FROM time_off t LEFT JOIN employees e ON e.id = t.employee_id
        WHERE ${clause} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    return c.json({ items, total, page, limit } as never);
  });

  const createOff = createRoute({
    method: "post",
    path: "/api/time-off",
    tags: ["Requests"],
    summary: "Record a time-off request",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              employee_id: z.string(),
              start_date: z.string().regex(DATE),
              end_date: z.string().regex(DATE),
              kind: z.enum(["holiday", "sick", "unpaid", "other"]).default("holiday"),
              status: z.enum(["pending", "approved", "declined"]).default("pending"),
              note: z.string().max(500).default(""),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The request", TimeOffSchema), 400: fail("Bad dates"), 403: fail("No organisation") },
  });

  app.openapi(createOff, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    if (b.end_date < b.start_date) return c.json({ error: "The last day cannot be before the first" }, 400);
    const id = uid();
    await run(
      `INSERT INTO time_off (id, org_id, employee_id, start_date, end_date, kind, status, note, created_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, org, b.employee_id, b.start_date, b.end_date, b.kind, b.status, b.note, now(), b.status === "pending" ? null : now()],
    );
    return c.json((await oneOff(org, id)) as never);
  });

  const decideOff = createRoute({
    method: "post",
    path: "/api/time-off/{id}/decide",
    tags: ["Requests"],
    summary: "Approve or decline time off",
    description:
      "Approving makes the dates a hard block on the schedule: assigning a shift inside them raises a conflict rather than going through quietly.",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ status: z.enum(["approved", "declined", "pending"]) }) } } },
    },
    responses: { 200: ok("The request", TimeOffSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(decideOff, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const found = await get(`SELECT id FROM time_off WHERE id = ? AND org_id = ?`, [id, org]);
    if (!found) return c.json({ error: "No such request" }, 404);
    await run(`UPDATE time_off SET status = ?, decided_at = ? WHERE id = ? AND org_id = ?`, [
      status,
      status === "pending" ? null : now(),
      id,
      org,
    ]);
    return c.json((await oneOff(org, id)) as never);
  });

  const dropOff = createRoute({
    method: "delete",
    path: "/api/time-off/{id}",
    tags: ["Requests"],
    summary: "Delete a time-off request",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(dropOff, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    await run(`DELETE FROM time_off WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });

  /* ── swaps and pickups ───────────────────────────────────────────────── */

  const listSwaps = createRoute({
    method: "get",
    path: "/api/swaps",
    tags: ["Requests"],
    summary: "Shifts offered up or claimed, newest first",
    request: { query: PaginationQuery.extend({ status: z.string().optional() }) },
    responses: {
      200: ok("A page of swaps", z.object({ items: z.array(SwapSchema), total: z.number(), page: z.number(), limit: z.number() })),
      403: fail("No organisation"),
    },
  });

  app.openapi(listSwaps, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const q = c.req.valid("query");
    const { limit, offset, page } = paginate(q);
    const where = ["s.org_id = ?"];
    const args: unknown[] = [org];
    if (q.status) {
      where.push("s.status = ?");
      args.push(q.status);
    }
    const clause = where.join(" AND ");
    const total = ((await get(`SELECT COUNT(*) AS n FROM swaps s WHERE ${clause}`, args)) as { n: number } | null)?.n ?? 0;
    const items = await query(
      `SELECT s.*,
              COALESCE(f.name, 'Open shift') AS from_name,
              COALESCE(t.name, 'Nobody yet') AS to_name,
              COALESCE(sh.date, '') AS shift_date,
              COALESCE(sh.start_min, 0) AS shift_start,
              COALESCE(sh.end_min, 0) AS shift_end
         FROM swaps s
         LEFT JOIN employees f ON f.id = s.from_employee_id
         LEFT JOIN employees t ON t.id = s.to_employee_id
         LEFT JOIN shifts sh ON sh.id = s.shift_id
        WHERE ${clause} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const rows = (items as unknown as (Record<string, unknown> & { shift_date: string; shift_start: number; shift_end: number })[]).map(
      (r) => ({
        ...r,
        shift_label: shiftLabel(r.shift_date, r.shift_start, r.shift_end),
      }),
    );
    return c.json({ items: rows, total, page, limit } as never);
  });

  const offer = createRoute({
    method: "post",
    path: "/api/swaps",
    tags: ["Requests"],
    summary: "Offer a shift up, or claim one that is open",
    description:
      "Leave `to_employee_id` empty to put a shift on the board. Set it to say who has offered to take it. Approving is a separate step, so the trail shows both.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              shift_id: z.string(),
              to_employee_id: z.string().nullable().default(null),
              reason: z.string().max(400).default(""),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The swap", SwapSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(offer, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const shift = (await get(`SELECT id, employee_id FROM shifts WHERE id = ? AND org_id = ?`, [b.shift_id, org])) as
      | { id: string; employee_id: string | null }
      | null;
    if (!shift) return c.json({ error: "No such shift" }, 404);

    const id = uid();
    await run(
      `INSERT INTO swaps (id, org_id, shift_id, from_employee_id, to_employee_id, status, reason, created_at, decided_at, decided_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, '')`,
      [id, org, b.shift_id, shift.employee_id, b.to_employee_id, b.reason, now()],
    );
    return c.json((await oneSwap(org, id)) as never);
  });

  const claim = createRoute({
    method: "post",
    path: "/api/swaps/{id}/claim",
    tags: ["Requests"],
    summary: "Name who has offered to take the shift",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ to_employee_id: z.string() }) } } },
    },
    responses: { 200: ok("The swap", SwapSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(claim, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const found = await get(`SELECT id FROM swaps WHERE id = ? AND org_id = ? AND status = 'pending'`, [id, org]);
    if (!found) return c.json({ error: "No such open swap" }, 404);
    await run(`UPDATE swaps SET to_employee_id = ? WHERE id = ? AND org_id = ?`, [b.to_employee_id, id, org]);
    return c.json((await oneSwap(org, id)) as never);
  });

  const decideSwap = createRoute({
    method: "post",
    path: "/api/swaps/{id}/decide",
    tags: ["Requests"],
    summary: "Approve a swap, which moves the shift, or decline it",
    description:
      "Approving reassigns the shift and writes the move into the week's change log, so the person losing it and the person gaining it are both on the record.",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ status: z.enum(["approved", "declined", "withdrawn"]) }) } } },
    },
    responses: { 200: ok("The swap", SwapSchema), 400: fail("Nobody to give it to"), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(decideSwap, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const swap = (await get(`SELECT * FROM swaps WHERE id = ? AND org_id = ?`, [id, org])) as
      | { id: string; shift_id: string; from_employee_id: string | null; to_employee_id: string | null }
      | null;
    if (!swap) return c.json({ error: "No such swap" }, 404);
    if (status === "approved" && !swap.to_employee_id) {
      return c.json({ error: "Nobody has offered to take this shift yet" }, 400);
    }

    const actor = actorName(user(c), caller(c));
    const ts = now();
    await run(`UPDATE swaps SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND org_id = ?`, [status, ts, actor, id, org]);

    if (status === "approved") {
      const shift = (await get(`SELECT * FROM shifts WHERE id = ? AND org_id = ?`, [swap.shift_id, org])) as
        | { id: string; date: string; start_min: number; end_min: number; week_start: string }
        | null;
      if (shift) {
        await run(`UPDATE shifts SET employee_id = ?, updated_at = ? WHERE id = ? AND org_id = ?`, [
          swap.to_employee_id,
          ts,
          swap.shift_id,
          org,
        ]);
        const week = await ensureWeek(org, weekStartOf(shift.date));
        const from = swap.from_employee_id ? await nameOf(org, swap.from_employee_id) : "the open shifts";
        const to = await nameOf(org, swap.to_employee_id as string);
        await logChange({
          org,
          week,
          kind: "reassigned",
          detail: `Swap approved: ${shift.date} ${clock(shift.start_min)}–${clock(shift.end_min)} moved from ${from} to ${to}.`,
          actor,
          shiftId: shift.id,
          employeeId: swap.to_employee_id,
          date: shift.date,
          startMin: shift.start_min,
        });
      }
    }

    return c.json((await oneSwap(org, id)) as never);
  });
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Sat 19 Sep 17:00-22:00". A manager scanning swaps reads a weekday, not an ISO date. */
function shiftLabel(date: string, start: number, end: number): string {
  if (!date) return "Shift deleted";
  const day = new Date(Date.parse(`${date}T00:00:00Z`));
  const month = day.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${DAY_SHORT[weekdayOf(date)]} ${Number(date.slice(8))} ${month} ${clock(start)}\u2013${clock(end)}`;
}

async function oneOff(org: string, id: string) {
  return await get(
    `SELECT t.*, COALESCE(e.name, 'Removed') AS employee_name
       FROM time_off t LEFT JOIN employees e ON e.id = t.employee_id
      WHERE t.id = ? AND t.org_id = ?`,
    [id, org],
  );
}

async function oneSwap(org: string, id: string) {
  const r = (await get(
    `SELECT s.*,
            COALESCE(f.name, 'Open shift') AS from_name,
            COALESCE(t.name, 'Nobody yet') AS to_name,
            COALESCE(sh.date, '') AS shift_date,
            COALESCE(sh.start_min, 0) AS shift_start,
            COALESCE(sh.end_min, 0) AS shift_end
       FROM swaps s
       LEFT JOIN employees f ON f.id = s.from_employee_id
       LEFT JOIN employees t ON t.id = s.to_employee_id
       LEFT JOIN shifts sh ON sh.id = s.shift_id
      WHERE s.id = ? AND s.org_id = ?`,
    [id, org],
  )) as (Record<string, unknown> & { shift_date: string; shift_start: number; shift_end: number }) | null;
  if (!r) return null;
  return { ...r, shift_label: shiftLabel(r.shift_date, r.shift_start, r.shift_end) };
}

async function nameOf(org: string, employeeId: string): Promise<string> {
  const row = (await get(`SELECT name FROM employees WHERE id = ? AND org_id = ?`, [employeeId, org])) as { name: string } | null;
  return row?.name ?? "someone no longer on the roster";
}
