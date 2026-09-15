// Formatting shared by every screen. The clock and hour helpers mirror the
// server's so a number never reads differently in two places.

export function clock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "09:00" or "9" back to minutes. Returns null rather than guessing. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2] ?? 0);
  if (h > 24 || mins > 59) return null;
  return Math.min(1440, h * 60 + mins);
}

export function hours(n: number): string {
  return `${Math.round(n * 10) / 10}h`;
}

export function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    // An unrecognised currency code should not take the page down with it.
    return `${Math.round(minor / 100)} ${currency}`;
  }
}

export function relative(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const weekday = (new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function dayLabel(date: string): string {
  return `${date.slice(8)}/${date.slice(5, 7)}`;
}

/** Long dates read better than ISO in a heading, and never in a table cell. */
export function longDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
