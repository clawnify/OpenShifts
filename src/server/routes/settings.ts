// Install-wide rules: the rest rule, the overtime threshold, and the one link
// the team uses. One row per org, created on first read.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, run } from "../db.js";
import { fail, now, ok, shareToken, type App } from "../env.js";

export interface SettingsRow {
  org_id: string;
  business_name: string;
  min_rest_hours: number;
  overtime_after: number;
  overtime_rate: number;
  currency: string;
  share_token: string;
  show_changes: number;
  updated_at: string;
}

const SettingsSchema = z
  .object({
    business_name: z.string(),
    min_rest_hours: z.number(),
    overtime_after: z.number(),
    overtime_rate: z.number(),
    currency: z.string(),
    share_token: z.string(),
    show_changes: z.number(),
    updated_at: z.string(),
  })
  .openapi("Settings");

/**
 * The org's settings, created with the defaults on first read.
 *
 * Creating on read rather than on write is what lets the schedule screen work
 * on a fresh install without anyone visiting a settings page first.
 */
export async function readSettings(org: string): Promise<SettingsRow> {
  const found = await get(`SELECT * FROM settings WHERE org_id = ?`, [org]);
  if (found) return found as unknown as SettingsRow;
  const ts = now();
  await run(
    `INSERT INTO settings (org_id, business_name, min_rest_hours, overtime_after, overtime_rate, currency, share_token, show_changes, updated_at)
     VALUES (?, '', 11, 40, 150, 'EUR', ?, 1, ?)
     ON CONFLICT(org_id) DO NOTHING`,
    [org, shareToken(), ts],
  );
  return (await get(`SELECT * FROM settings WHERE org_id = ?`, [org])) as unknown as SettingsRow;
}

export function registerSettings(app: App) {
  const read = createRoute({
    method: "get",
    path: "/api/settings",
    tags: ["Settings"],
    summary: "The rest rule, overtime threshold, currency and team link",
    responses: { 200: ok("The settings", SettingsSchema), 403: fail("No organisation") },
  });

  app.openapi(read, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    return c.json((await readSettings(org)) as never);
  });

  const write = createRoute({
    method: "put",
    path: "/api/settings",
    tags: ["Settings"],
    summary: "Change the scheduling rules",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              business_name: z.string().max(120).optional(),
              min_rest_hours: z.number().min(0).max(48).optional(),
              overtime_after: z.number().min(0).max(168).optional(),
              overtime_rate: z.number().int().min(100).max(400).optional(),
              currency: z.string().length(3).optional(),
              show_changes: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The settings", SettingsSchema), 403: fail("No organisation") },
  });

  app.openapi(write, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    await readSettings(org);
    const b = c.req.valid("json");

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ["business_name", "min_rest_hours", "overtime_after", "overtime_rate", "currency"] as const) {
      if (b[key] !== undefined) {
        sets.push(`${key} = ?`);
        args.push(b[key]);
      }
    }
    if (b.show_changes !== undefined) {
      sets.push("show_changes = ?");
      args.push(b.show_changes ? 1 : 0);
    }
    if (sets.length) {
      sets.push("updated_at = ?");
      args.push(now(), org);
      await run(`UPDATE settings SET ${sets.join(", ")} WHERE org_id = ?`, args);
    }
    return c.json((await readSettings(org)) as never);
  });

  const rotate = createRoute({
    method: "post",
    path: "/api/settings/rotate-link",
    tags: ["Settings"],
    summary: "Issue a new team link and kill every copy of the old one",
    description: "Use after someone leaves. The previous URL stops resolving immediately.",
    responses: { 200: ok("The new token", z.object({ share_token: z.string() })), 403: fail("No organisation") },
  });

  app.openapi(rotate, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    await readSettings(org);
    const token = shareToken();
    await run(`UPDATE settings SET share_token = ?, updated_at = ? WHERE org_id = ?`, [token, now(), org]);
    return c.json({ share_token: token } as never);
  });
}
