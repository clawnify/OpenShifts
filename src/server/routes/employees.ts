// The roster, and what each person has told you about when they can work.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, OkSchema, paginate, PaginationQuery, uid, type App } from "../env.js";

const EmployeeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    role: z.string(),
    hourly_rate: z.number(),
    contract_hours: z.number(),
    max_hours: z.number(),
    active: z.number(),
    note: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Employee");

const AvailabilitySchema = z
  .object({
    id: z.string(),
    employee_id: z.string(),
    weekday: z.number(),
    start_min: z.number(),
    end_min: z.number(),
    kind: z.string(),
    note: z.string(),
  })
  .openapi("Availability");

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().max(200).default(""),
  phone: z.string().max(60).default(""),
  role: z.string().max(80).default(""),
  hourly_rate: z.number().int().min(0).max(1_000_000).default(0),
  contract_hours: z.number().min(0).max(168).default(0),
  max_hours: z.number().min(0).max(168).default(0),
  active: z.boolean().default(true),
  note: z.string().max(2000).default(""),
});

export function registerEmployees(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/employees",
    tags: ["Team"],
    summary: "The roster, one page at a time",
    request: { query: PaginationQuery.extend({ active: z.string().optional() }) },
    responses: {
      200: ok("A page of people", z.object({ items: z.array(EmployeeSchema), total: z.number(), page: z.number(), limit: z.number() })),
      403: fail("No organisation"),
    },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const q = c.req.valid("query");
    const { limit, offset, page } = paginate(q);

    const where = ["org_id = ?"];
    const args: unknown[] = [org];
    if (q.search) {
      where.push("(name LIKE ? OR role LIKE ?)");
      args.push(`%${q.search}%`, `%${q.search}%`);
    }
    if (q.active === "1" || q.active === "0") {
      where.push("active = ?");
      args.push(Number(q.active));
    }
    const clause = where.join(" AND ");

    const total = ((await get(`SELECT COUNT(*) AS n FROM employees WHERE ${clause}`, args)) as { n: number } | null)?.n ?? 0;
    const items = await query(
      `SELECT * FROM employees WHERE ${clause} ORDER BY active DESC, name LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    return c.json({ items, total, page, limit } as never);
  });

  const create = createRoute({
    method: "post",
    path: "/api/employees",
    tags: ["Team"],
    summary: "Add someone to the roster",
    request: { body: { content: { "application/json": { schema: Body } } } },
    responses: { 200: ok("The new person", EmployeeSchema), 403: fail("No organisation") },
  });

  app.openapi(create, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const id = uid();
    const ts = now();
    await run(
      `INSERT INTO employees (id, org_id, name, email, phone, role, hourly_rate, contract_hours, max_hours, active, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, org, b.name, b.email, b.phone, b.role, b.hourly_rate, b.contract_hours, b.max_hours, b.active ? 1 : 0, b.note, ts, ts],
    );
    return c.json((await get(`SELECT * FROM employees WHERE id = ? AND org_id = ?`, [id, org])) as never);
  });

  const update = createRoute({
    method: "patch",
    path: "/api/employees/{id}",
    tags: ["Team"],
    summary: "Change someone's details, pay or contract",
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: Body.partial() } } } },
    responses: { 200: ok("The updated person", EmployeeSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(update, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const existing = await get(`SELECT * FROM employees WHERE id = ? AND org_id = ?`, [id, org]);
    if (!existing) return c.json({ error: "No such person" }, 404);

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ["name", "email", "phone", "role", "hourly_rate", "contract_hours", "max_hours", "note"] as const) {
      if (b[key] !== undefined) {
        sets.push(`${key} = ?`);
        args.push(b[key]);
      }
    }
    if (b.active !== undefined) {
      sets.push("active = ?");
      args.push(b.active ? 1 : 0);
    }
    if (sets.length) {
      sets.push("updated_at = ?");
      args.push(now(), id, org);
      await run(`UPDATE employees SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`, args);
    }
    return c.json((await get(`SELECT * FROM employees WHERE id = ? AND org_id = ?`, [id, org])) as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/employees/{id}",
    tags: ["Team"],
    summary: "Remove someone, and unassign the shifts they were holding",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Removed", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    // The shifts survive as open shifts. Deleting them instead would quietly
    // remove coverage the floor is still counting on.
    await run(`UPDATE shifts SET employee_id = NULL, updated_at = ? WHERE employee_id = ? AND org_id = ?`, [now(), id, org]);
    await run(`DELETE FROM availability WHERE employee_id = ? AND org_id = ?`, [id, org]);
    await run(`DELETE FROM employees WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });

  /* ── availability ────────────────────────────────────────────────────── */

  const listAvailability = createRoute({
    method: "get",
    path: "/api/employees/{id}/availability",
    tags: ["Team"],
    summary: "When this person has said they cannot work",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Their weekly pattern", z.object({ items: z.array(AvailabilitySchema) })), 403: fail("No organisation") },
  });

  app.openapi(listAvailability, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    // Bounded by construction: at most a handful of windows per weekday.
    const items = await query(
      `SELECT id, employee_id, weekday, start_min, end_min, kind, note
         FROM availability WHERE org_id = ? AND employee_id = ? ORDER BY weekday, start_min LIMIT 100`,
      [org, id],
    );
    return c.json({ items } as never);
  });

  const addAvailability = createRoute({
    method: "post",
    path: "/api/employees/{id}/availability",
    tags: ["Team"],
    summary: "Record a window this person is unavailable, or would prefer",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              weekday: z.number().int().min(0).max(6),
              start_min: z.number().int().min(0).max(1440),
              end_min: z.number().int().min(0).max(1440),
              kind: z.enum(["unavailable", "preferred"]).default("unavailable"),
              note: z.string().max(200).default(""),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The window", AvailabilitySchema), 400: fail("Bad window"), 403: fail("No organisation") },
  });

  app.openapi(addAvailability, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    if (b.end_min <= b.start_min) return c.json({ error: "The window has to end after it starts" }, 400);
    const rowId = uid();
    await run(
      `INSERT INTO availability (id, org_id, employee_id, weekday, start_min, end_min, kind, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rowId, org, id, b.weekday, b.start_min, b.end_min, b.kind, b.note, now()],
    );
    return c.json((await get(
      `SELECT id, employee_id, weekday, start_min, end_min, kind, note FROM availability WHERE id = ?`,
      [rowId],
    )) as never);
  });

  const dropAvailability = createRoute({
    method: "delete",
    path: "/api/availability/{id}",
    tags: ["Team"],
    summary: "Drop an availability window",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Dropped", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(dropAvailability, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { id } = c.req.valid("param");
    await run(`DELETE FROM availability WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });
}
