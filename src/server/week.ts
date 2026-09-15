// The week record and its change log.
//
// A week exists as a row the first time anyone touches it. Publishing stamps
// `published_at`, and from that moment every edit to a shift in the week writes
// a `changes` row. That is the whole mechanism behind the app's one promise:
// a published rota can still change, but it cannot change quietly.

import { get, query, run } from "./db.js";
import { now, uid } from "./env.js";
import { noticeHours, round1 } from "./schedule.js";

export interface WeekRow {
  org_id: string;
  week_start: string;
  published_at: string | null;
  published_by: string;
  budget: number;
  note: string;
  created_at: string;
  updated_at: string;
}

/** The week's row, created empty and unpublished if this is its first touch. */
export async function ensureWeek(org: string, weekStart: string): Promise<WeekRow> {
  const found = await get(`SELECT * FROM weeks WHERE org_id = ? AND week_start = ?`, [org, weekStart]);
  if (found) return found as unknown as WeekRow;
  const ts = now();
  await run(
    `INSERT INTO weeks (org_id, week_start, published_at, published_by, budget, note, created_at, updated_at)
     VALUES (?, ?, NULL, '', 0, '', ?, ?)
     ON CONFLICT(org_id, week_start) DO NOTHING`,
    [org, weekStart, ts, ts],
  );
  const row = await get(`SELECT * FROM weeks WHERE org_id = ? AND week_start = ?`, [org, weekStart]);
  return row as unknown as WeekRow;
}

/**
 * Record a change to a published week.
 *
 * A no-op while the week is still a draft: a draft is nobody's promise yet, and
 * logging every keystroke of a rota being built would bury the entries that
 * matter under the ones that do not.
 */
export async function logChange(input: {
  org: string;
  week: WeekRow;
  kind: "added" | "removed" | "reassigned" | "retimed" | "published" | "unpublished";
  detail: string;
  actor: string;
  shiftId?: string | null;
  employeeId?: string | null;
  /** The shift's date and start, so the log can state how much notice was given. */
  date?: string;
  startMin?: number;
}): Promise<void> {
  const isLifecycle = input.kind === "published" || input.kind === "unpublished";
  if (!input.week.published_at && !isLifecycle) return;

  const notice =
    input.date !== undefined && input.startMin !== undefined ? round1(noticeHours(input.date, input.startMin)) : null;

  await run(
    `INSERT INTO changes (id, org_id, week_start, shift_id, kind, detail, actor, employee_id, notice_hours, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid(),
      input.org,
      input.week.week_start,
      input.shiftId ?? null,
      input.kind,
      input.detail,
      input.actor,
      input.employeeId ?? null,
      notice,
      now(),
    ],
  );
}

export interface ChangeRow {
  id: string;
  kind: string;
  detail: string;
  actor: string;
  employee_id: string | null;
  notice_hours: number | null;
  at: string;
}

export async function changesFor(org: string, weekStart: string, limit = 50): Promise<ChangeRow[]> {
  return (await query(
    `SELECT id, kind, detail, actor, employee_id, notice_hours, at
       FROM changes WHERE org_id = ? AND week_start = ?
      ORDER BY at DESC LIMIT ?`,
    [org, weekStart, limit],
  )) as unknown as ChangeRow[];
}

/** Who to attribute a change to. An agent edit says so rather than borrowing a name. */
export function actorName(u: { name?: string | null; email?: string | null } | null, who: string): string {
  if (who === "agent" || who === "agent-browser") return "agent";
  if (who === "api") return "api";
  return u?.name || u?.email || "someone";
}
