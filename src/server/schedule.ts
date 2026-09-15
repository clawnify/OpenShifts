// The rules of a rota, as pure functions.
//
// Everything here takes plain rows and returns plain values, so the conflict
// warnings the grid draws, the ones the API returns to the agent, and the ones
// the tests assert are all the same code. A conflict computed in a component
// would be invisible to both of the others.

/** Minutes in a day. A shift whose end is not after its start crosses midnight. */
export const DAY = 1440;

export interface ShiftRow {
  id: string;
  date: string;
  start_min: number;
  end_min: number;
  break_min: number;
  role: string;
  employee_id: string | null;
}

export interface EmployeeRow {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  contract_hours: number;
  max_hours: number;
}

export interface AvailabilityRow {
  employee_id: string;
  weekday: number;
  start_min: number;
  end_min: number;
  kind: string;
}

export interface TimeOffRow {
  employee_id: string;
  start_date: string;
  end_date: string;
  kind: string;
  status: string;
}

export type ConflictKind = "unavailable" | "time-off" | "double-booked" | "rest" | "over-hours";

export interface Conflict {
  shift_id: string;
  employee_id: string;
  kind: ConflictKind;
  /** One sentence, written for the person assigning the shift. */
  message: string;
  /** `block` is a promise already made to this person; `warn` is a judgement call. */
  severity: "block" | "warn";
}

/* ── dates ─────────────────────────────────────────────────────────────── */

/** Parsed as UTC midnight so arithmetic never crosses a daylight-saving seam. */
function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** 0 = Monday … 6 = Sunday, matching `weeks.week_start` always being a Monday. */
export function weekdayOf(date: string): number {
  return (new Date(dayMs(date)).getUTCDay() + 6) % 7;
}

export function addDays(date: string, n: number): string {
  return new Date(dayMs(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday on or before `date`. The identity of the week everywhere else. */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/* ── one shift ─────────────────────────────────────────────────────────── */

/**
 * Paid minutes: the span minus the unpaid break, with midnight handled.
 *
 * `end < start` is a night shift, not bad data, so it gains a day rather than
 * returning a negative. Getting this wrong silently pays a 22:00-06:00 nurse
 * for minus sixteen hours.
 *
 * `end === start` is zero, NOT a full day. The two cases look alike and are
 * not: a shift declares intent and the API refuses a zero-length one, but a
 * clock pair is two observed times, and punching in and straight back out is
 * an ordinary mis-punch. Folding it into the overnight branch put 23.5 hours
 * on a timesheet for a single mistaken tap. A genuine 24-hour shift cannot be
 * written either way and is split into two.
 */
export function shiftMinutes(shift: Pick<ShiftRow, "start_min" | "end_min" | "break_min">): number {
  const span =
    shift.end_min > shift.start_min
      ? shift.end_min - shift.start_min
      : shift.end_min === shift.start_min
        ? 0
        : shift.end_min + DAY - shift.start_min;
  return Math.max(0, span - shift.break_min);
}

export function shiftHours(shift: Pick<ShiftRow, "start_min" | "end_min" | "break_min">): number {
  return shiftMinutes(shift) / 60;
}

/** Absolute start and end in minutes since the epoch-day, so two shifts on
 *  different dates can be compared without special-casing the overnight one. */
function span(shift: ShiftRow): { from: number; to: number } {
  const base = dayMs(shift.date) / 60_000;
  const from = base + shift.start_min;
  const to = from + shiftMinutes({ start_min: shift.start_min, end_min: shift.end_min, break_min: 0 });
  return { from, to };
}

export function shiftsOverlap(a: ShiftRow, b: ShiftRow): boolean {
  const x = span(a);
  const y = span(b);
  return x.from < y.to && y.from < x.to;
}

/** Hours between the end of the earlier shift and the start of the later one. */
export function restHoursBetween(a: ShiftRow, b: ShiftRow): number {
  const x = span(a);
  const y = span(b);
  const [first, second] = x.from <= y.from ? [x, y] : [y, x];
  return (second.from - first.to) / 60;
}

export function overlapsWindow(shift: ShiftRow, from: number, to: number): boolean {
  // Compare inside one day. A night shift is split at midnight so the part that
  // lands in the window is still caught.
  const end = shift.end_min > shift.start_min ? shift.end_min : DAY;
  return shift.start_min < to && from < end;
}

export function coversDate(off: TimeOffRow, date: string): boolean {
  return off.start_date <= date && date <= off.end_date;
}

/* ── the whole week ────────────────────────────────────────────────────── */

export function hoursByEmployee(shifts: ShiftRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of shifts) {
    if (!s.employee_id) continue;
    out.set(s.employee_id, (out.get(s.employee_id) ?? 0) + shiftHours(s));
  }
  return out;
}

/**
 * Every reason this week's assignments are a problem.
 *
 * Split by who the promise was made to. A `block` breaks something the person
 * was already told — their stated availability, their approved leave, or the
 * fact that they cannot be in two places. A `warn` is a policy the manager may
 * knowingly override: short rest, or hours past the contract.
 */
export function findConflicts(input: {
  shifts: ShiftRow[];
  employees: EmployeeRow[];
  availability: AvailabilityRow[];
  timeOff: TimeOffRow[];
  minRestHours: number;
}): Conflict[] {
  const { shifts, employees, availability, timeOff, minRestHours } = input;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const assigned = shifts.filter((s) => s.employee_id);
  const out: Conflict[] = [];

  const push = (s: ShiftRow, kind: ConflictKind, message: string, severity: Conflict["severity"]) =>
    out.push({ shift_id: s.id, employee_id: s.employee_id as string, kind, message, severity });

  for (const shift of assigned) {
    const who = byId.get(shift.employee_id as string);
    const name = who?.name ?? "This person";
    const weekday = weekdayOf(shift.date);

    for (const a of availability) {
      if (a.employee_id !== shift.employee_id || a.weekday !== weekday) continue;
      if (a.kind !== "unavailable") continue;
      if (overlapsWindow(shift, a.start_min, a.end_min)) {
        push(shift, "unavailable", `${name} said they are not available ${clock(a.start_min)}–${clock(a.end_min)} on this day.`, "block");
      }
    }

    for (const off of timeOff) {
      if (off.employee_id !== shift.employee_id || off.status !== "approved") continue;
      if (coversDate(off, shift.date)) {
        push(shift, "time-off", `${name} has approved ${off.kind} covering ${shift.date}.`, "block");
      }
    }
  }

  // Pairwise, per person. A week's shifts for one person is a handful, so the
  // quadratic pass is over single-digit lists, not over the week.
  const perPerson = new Map<string, ShiftRow[]>();
  for (const s of assigned) {
    const list = perPerson.get(s.employee_id as string) ?? [];
    list.push(s);
    perPerson.set(s.employee_id as string, list);
  }

  for (const [employeeId, list] of perPerson) {
    const name = byId.get(employeeId)?.name ?? "This person";
    const sorted = [...list].sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date < b.date ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (shiftsOverlap(a, b)) {
          push(b, "double-booked", `${name} is already on a shift that overlaps this one.`, "block");
          continue;
        }
        const rest = restHoursBetween(a, b);
        // Only the immediately following shift can be the short-rest one.
        if (j === i + 1 && rest >= 0 && rest < minRestHours) {
          push(
            b,
            "rest",
            `Only ${round1(rest)}h off after the previous shift. The rest rule is ${round1(minRestHours)}h.`,
            "warn",
          );
        }
      }
    }
  }

  const hours = hoursByEmployee(shifts);
  for (const [employeeId, worked] of hours) {
    const who = byId.get(employeeId);
    if (!who || who.max_hours <= 0) continue;
    if (worked > who.max_hours + 0.001) {
      const last = perPerson.get(employeeId)?.slice(-1)[0];
      if (last) {
        push(
          last,
          "over-hours",
          `${who.name} is scheduled ${round1(worked)}h this week, over their ${round1(who.max_hours)}h limit.`,
          "warn",
        );
      }
    }
  }

  return out;
}

/* ── money ─────────────────────────────────────────────────────────────── */

export interface CostLine {
  employee_id: string;
  name: string;
  hours: number;
  overtime_hours: number;
  /** Minor units, overtime already multiplied. */
  cost: number;
}

/**
 * What the week costs in wages, in minor units.
 *
 * This is the number a manager is judged on and the reason the spreadsheets
 * survive, so it is computed here and shown for free rather than sold as an
 * analytics tier.
 */
export function weekCost(
  shifts: ShiftRow[],
  employees: EmployeeRow[],
  opts: { overtimeAfter: number; overtimeRate: number },
): { lines: CostLine[]; total: number; hours: number } {
  const hours = hoursByEmployee(shifts);
  const lines: CostLine[] = [];
  let total = 0;
  let totalHours = 0;

  for (const who of employees) {
    const worked = hours.get(who.id) ?? 0;
    if (worked === 0) continue;
    const overtime = opts.overtimeAfter > 0 ? Math.max(0, worked - opts.overtimeAfter) : 0;
    const normal = worked - overtime;
    // Rounded once, at the line, so the total is the sum of what is displayed.
    const cost = Math.round(normal * who.hourly_rate + overtime * who.hourly_rate * (opts.overtimeRate / 100));
    lines.push({ employee_id: who.id, name: who.name, hours: worked, overtime_hours: overtime, cost });
    total += cost;
    totalHours += worked;
  }

  lines.sort((a, b) => b.cost - a.cost);
  return { lines, total, hours: totalHours };
}

/* ── formatting shared with the staff page ─────────────────────────────── */

export function clock(min: number): string {
  const m = ((min % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Hours of notice between now and a shift starting. Negative once it has begun.
 * The complaints in this category are all about this number being small.
 */
export function noticeHours(date: string, startMin: number, at: Date = new Date()): number {
  return (dayMs(date) + startMin * 60_000 - at.getTime()) / 3_600_000;
}
