// The team's page: /s/<token>.
//
// One stable link, no login, read-only. This is the surface a WhatsApp group
// photo of the rota actually occupies, so it has to survive being opened on a
// cracked phone in a stockroom: server-rendered HTML, no bundle, no fonts to
// fetch, and it prints.
//
// It shows only PUBLISHED weeks, and it shows the change log underneath. A rota
// that changed after it was promised says so on the same page as the rota.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query } from "../db.js";
import { fail, ok, type App } from "../env.js";
import { addDays, clock, shiftHours, weekDates, weekStartOf, round1, DAY } from "../schedule.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function registerPublic(app: App) {
  // Off the OpenAPI surface on purpose: this is a page for people, and the
  // agent has no reason to discover it as an endpoint.
  app.get("/s/:token", async (c) => {
    const token = c.req.param("token");
    if (!token || token.length < 8) return c.text("Not found", 404);

    const settings = (await get(
      `SELECT org_id, business_name, currency, show_changes FROM settings WHERE share_token = ?`,
      [token],
    )) as { org_id: string; business_name: string; currency: string; show_changes: number } | null;
    if (!settings) return c.text("This link is no longer active.", 404);

    const org = settings.org_id;
    const asked = c.req.query("week");
    const requested = weekStartOf(asked && DATE_RE.test(asked) ? asked : new Date().toISOString().slice(0, 10));

    // Only published weeks are reachable. Asking for a draft falls back to the
    // most recent published week rather than leaking a rota still being built.
    let week = (await get(`SELECT week_start, published_at FROM weeks WHERE org_id = ? AND week_start = ? AND published_at IS NOT NULL`, [
      org,
      requested,
    ])) as { week_start: string; published_at: string } | null;
    if (!week) {
      week = (await get(
        `SELECT week_start, published_at FROM weeks WHERE org_id = ? AND published_at IS NOT NULL ORDER BY week_start DESC LIMIT 1`,
        [org],
      )) as { week_start: string; published_at: string } | null;
    }

    const title = esc(settings.business_name || "Schedule");
    if (!week) return c.html(shell(title, `<p class="empty">No week has been published yet.</p>`));

    const dates = weekDates(week.week_start);
    const shifts = (await query(
      `SELECT s.id, s.date, s.start_min, s.end_min, s.break_min, s.role, s.employee_id, s.note,
              COALESCE(e.name, '') AS name
         FROM shifts s LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.org_id = ? AND s.week_start = ? ORDER BY s.date, s.start_min LIMIT 1000`,
      [org, week.week_start],
    )) as unknown as {
      id: string;
      date: string;
      start_min: number;
      end_min: number;
      break_min: number;
      role: string;
      employee_id: string | null;
      note: string;
      name: string;
    }[];

    const changes = settings.show_changes
      ? ((await query(
          `SELECT detail, actor, notice_hours, at FROM changes
            WHERE org_id = ? AND week_start = ? AND kind IN ('added','removed','reassigned','retimed')
              AND at > ? ORDER BY at DESC LIMIT 25`,
          [org, week.week_start, week.published_at],
        )) as unknown as { detail: string; actor: string; notice_hours: number | null; at: string }[])
      : [];

    const neighbours = (await query(
      `SELECT week_start FROM weeks WHERE org_id = ? AND published_at IS NOT NULL ORDER BY week_start`,
      [org],
    )) as unknown as { week_start: string }[];
    const idx = neighbours.findIndex((w) => w.week_start === week!.week_start);
    const prev = idx > 0 ? neighbours[idx - 1].week_start : null;
    const next = idx >= 0 && idx < neighbours.length - 1 ? neighbours[idx + 1].week_start : null;

    const days = dates
      .map((date, i) => {
        const onDay = shifts.filter((s) => s.date === date);
        const rows = onDay.length
          ? onDay
              .map((s) => {
                const night = s.end_min <= s.start_min;
                return `<li class="shift${s.employee_id ? "" : " open"}">
                <span class="who">${s.employee_id ? esc(s.name) : "Open shift"}</span>
                <span class="when">${clock(s.start_min)}–${clock(s.end_min)}${night ? ' <abbr title="Finishes the next morning">+1</abbr>' : ""}</span>
                ${s.role ? `<span class="role">${esc(s.role)}</span>` : ""}
                ${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}
              </li>`;
              })
              .join("")
          : `<li class="none">Nobody scheduled</li>`;
        return `<section class="day">
          <h2>${DAY_NAMES[i]} <span class="date">${date.slice(8)}/${date.slice(5, 7)}</span></h2>
          <ul>${rows}</ul>
        </section>`;
      })
      .join("");

    const totalHours = round1(shifts.filter((s) => s.employee_id).reduce((n, s) => n + shiftHours(s), 0));
    const open = shifts.filter((s) => !s.employee_id).length;

    const changeBlock = changes.length
      ? `<section class="changes">
          <h2>Changed after this week was published</h2>
          <p class="sub">Every edit since ${esc(new Date(week.published_at).toLocaleString("en-GB"))}, with who made it.</p>
          <ul>${changes
            .map(
              (ch) => `<li>
                <span class="detail">${esc(ch.detail)}</span>
                <span class="meta">${esc(ch.actor)} · ${esc(relative(ch.at))}${
                  ch.notice_hours !== null && ch.notice_hours < 24
                    ? ` · <strong class="short">${ch.notice_hours < 0 ? "after the shift started" : `${round1(ch.notice_hours)}h notice`}</strong>`
                    : ""
                }</span>
              </li>`,
            )
            .join("")}</ul>
        </section>`
      : settings.show_changes
        ? `<section class="changes"><h2>Changed after this week was published</h2><p class="sub">Nothing has changed since it was published.</p></section>`
        : "";

    return c.html(
      shell(
        title,
        `<header>
          <h1>${title}</h1>
          <p class="sub">Week of ${week.week_start} · published ${esc(relative(week.published_at))}</p>
          <p class="totals">${shifts.length} shift${shifts.length === 1 ? "" : "s"} · ${totalHours}h scheduled${open ? ` · ${open} open` : ""}</p>
          <nav>
            ${prev ? `<a href="?week=${prev}">← Previous week</a>` : `<span class="off">← Previous week</span>`}
            ${next ? `<a href="?week=${next}">Next week →</a>` : `<span class="off">Next week →</span>`}
          </nav>
        </header>
        <div class="days">${days}</div>
        ${changeBlock}
        <footer><p>Read-only. Ask your manager to change a shift.</p></footer>`,
      ),
    );
  });

  /* ── the link itself, for the dashboard to show ──────────────────────── */

  const link = createRoute({
    method: "get",
    path: "/api/share-link",
    tags: ["Settings"],
    summary: "The team's read-only schedule URL",
    responses: { 200: ok("The URL", z.object({ url: z.string(), token: z.string() })), 403: fail("No organisation") },
  });

  app.openapi(link, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const row = (await get(`SELECT share_token FROM settings WHERE org_id = ?`, [org])) as { share_token: string } | null;
    const token = row?.share_token ?? "";
    return c.json({ token, url: token ? new URL(`/s/${token}`, c.req.url).toString() : "" } as never);
  });
}

/**
 * The page's own chrome, inline.
 *
 * Deliberately not the app's design system: this renders on a phone with one
 * bar of signal, so it ships as one document with no stylesheet, no script and
 * no webfont to wait for. It is also the print stylesheet for the copy that
 * ends up on the staffroom wall.
 */
function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · Schedule</title>
<style>
  :root {
    --bg: #fff; --surface: #fff; --sunken: #f7f7f5; --ink: #1b1a19;
    --muted: #646360; --faint: #9a9893; --line: #e5e3de;
    --warn-bg: #f9efdf; --warn: #664e27; --open-bg: #f9eded; --open: #892f3b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #100f0e; --surface: #161615; --sunken: #222120; --ink: #efeeed;
      --muted: #c0bdb9; --faint: #82807c; --line: #2e2e2c;
      --warn-bg: #2d2518; --warn: #e5bd7e; --open-bg: #3b1c1e; --open: #e6b6b8;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.5rem 1rem 3rem; background: var(--bg); color: var(--ink);
    font: 400 0.9375rem/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 44rem; margin-inline: auto; -webkit-text-size-adjust: 100%;
  }
  h1 { font-size: 1.375rem; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
  h2 { font-size: 1.0625rem; font-weight: 600; margin: 0 0 0.5rem; }
  .sub, .totals { color: var(--muted); font-size: 0.875rem; margin: 0.25rem 0 0; }
  .totals { font-variant-numeric: tabular-nums; }
  header { padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
  header nav { margin-top: 0.875rem; display: flex; gap: 1rem; font-size: 0.875rem; }
  header nav a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 2px; }
  header nav .off { color: var(--faint); }
  .days { margin-top: 1.5rem; display: grid; gap: 0.75rem; }
  .day { background: var(--surface); border-radius: 0.75rem; box-shadow: inset 0 0 0 1px var(--line); padding: 1rem 1.25rem; }
  .day .date { color: var(--faint); font-weight: 400; font-variant-numeric: tabular-nums; }
  ul { list-style: none; margin: 0; padding: 0; }
  .shift { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px solid var(--line); }
  .shift:first-child { border-top: 0; padding-top: 0; }
  .who { font-weight: 500; }
  .when { color: var(--muted); font-size: 0.875rem; font-variant-numeric: tabular-nums; }
  .when abbr { text-decoration: none; color: var(--faint); }
  .role { background: var(--sunken); color: var(--muted); font-size: 0.75rem; border-radius: 0.25rem; padding: 0.125rem 0.5rem; }
  .note { color: var(--muted); font-size: 0.75rem; flex-basis: 100%; }
  .open .who { background: var(--open-bg); color: var(--open); border-radius: 999px; padding: 0.125rem 0.625rem; font-size: 0.75rem; }
  .none, .empty { color: var(--faint); font-size: 0.875rem; }
  .changes { margin-top: 1.5rem; background: var(--warn-bg); border-radius: 0.75rem; padding: 1rem 1.25rem; }
  .changes h2 { color: var(--warn); }
  .changes .sub { color: var(--warn); opacity: 0.85; }
  .changes li { padding: 0.5rem 0; border-top: 1px solid rgba(128,128,128,0.2); }
  .changes li:first-child { border-top: 0; }
  .changes .detail { display: block; }
  .changes .meta { color: var(--warn); opacity: 0.8; font-size: 0.75rem; }
  .changes .short { font-weight: 600; opacity: 1; }
  footer { margin-top: 2rem; color: var(--faint); font-size: 0.75rem; }
  @media print {
    body { max-width: none; color: #000; }
    .day { box-shadow: none; border: 1px solid #ccc; break-inside: avoid; }
    header nav, footer { display: none; }
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

export { DAY };
