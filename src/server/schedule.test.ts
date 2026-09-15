import { describe, expect, it } from "vitest";
import {
  addDays,
  clock,
  findConflicts,
  hoursByEmployee,
  noticeHours,
  restHoursBetween,
  shiftHours,
  shiftMinutes,
  shiftsOverlap,
  weekCost,
  weekDates,
  weekStartOf,
  weekdayOf,
  type AvailabilityRow,
  type EmployeeRow,
  type ShiftRow,
  type TimeOffRow,
} from "./schedule.js";

const shift = (over: Partial<ShiftRow> = {}): ShiftRow => ({
  id: "s1",
  date: "2026-09-15",
  start_min: 9 * 60,
  end_min: 17 * 60,
  break_min: 30,
  role: "",
  employee_id: "e1",
  ...over,
});

const person = (over: Partial<EmployeeRow> = {}): EmployeeRow => ({
  id: "e1",
  name: "Sam",
  role: "Barista",
  hourly_rate: 1200,
  contract_hours: 32,
  max_hours: 0,
  ...over,
});

describe("dates", () => {
  it("counts Monday as 0 and Sunday as 6", () => {
    expect(weekdayOf("2026-09-14")).toBe(0); // a Monday
    expect(weekdayOf("2026-09-15")).toBe(1);
    expect(weekdayOf("2026-09-20")).toBe(6); // the Sunday
  });

  it("snaps any date back to its Monday", () => {
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14");
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14");
  });

  it("walks a week without drifting across a DST boundary", () => {
    // Europe moves its clocks on 2026-10-25. Adding days must not lose an hour.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(weekDates("2026-10-19")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });
});

describe("shiftMinutes", () => {
  it("subtracts the unpaid break", () => {
    expect(shiftMinutes(shift())).toBe(8 * 60 - 30);
    expect(shiftHours(shift({ break_min: 0 }))).toBe(8);
  });

  it("reads a night shift as crossing midnight, not as negative time", () => {
    const night = shift({ start_min: 22 * 60, end_min: 6 * 60, break_min: 0 });
    expect(shiftMinutes(night)).toBe(8 * 60);
  });

  it("reads an equal start and end as zero, not as a full day", () => {
    // A clock pair where someone punched in and straight back out. Folding this
    // into the overnight branch put 23.5 hours on a timesheet for one tap.
    expect(shiftMinutes({ start_min: 1168, end_min: 1168, break_min: 30 })).toBe(0);
    expect(shiftMinutes({ start_min: 540, end_min: 540, break_min: 0 })).toBe(0);
  });

  it("never returns negative paid time when the break swallows the shift", () => {
    expect(shiftMinutes(shift({ start_min: 600, end_min: 660, break_min: 90 }))).toBe(0);
  });
});

describe("overlap and rest", () => {
  it("catches two shifts on the same day that share an hour", () => {
    const a = shift({ id: "a", start_min: 9 * 60, end_min: 17 * 60 });
    const b = shift({ id: "b", start_min: 16 * 60, end_min: 20 * 60 });
    expect(shiftsOverlap(a, b)).toBe(true);
  });

  it("does not call back-to-back shifts an overlap", () => {
    const a = shift({ id: "a", start_min: 9 * 60, end_min: 17 * 60 });
    const b = shift({ id: "b", start_min: 17 * 60, end_min: 21 * 60 });
    expect(shiftsOverlap(a, b)).toBe(false);
  });

  it("catches a night shift overlapping the next morning", () => {
    const night = shift({ id: "a", date: "2026-09-15", start_min: 22 * 60, end_min: 6 * 60 });
    const morning = shift({ id: "b", date: "2026-09-16", start_min: 5 * 60, end_min: 13 * 60 });
    expect(shiftsOverlap(night, morning)).toBe(true);
  });

  it("does not treat a zero-length entry as covering the whole day", () => {
    const a = shift({ id: "a", date: "2026-09-15", start_min: 600, end_min: 600 });
    const b = shift({ id: "b", date: "2026-09-15", start_min: 900, end_min: 1020 });
    expect(shiftsOverlap(a, b)).toBe(false);
  });

  it("measures the gap between a close and the next open", () => {
    const close = shift({ id: "a", date: "2026-09-15", start_min: 16 * 60, end_min: 23 * 60 });
    const open = shift({ id: "b", date: "2026-09-16", start_min: 6 * 60, end_min: 14 * 60 });
    expect(restHoursBetween(close, open)).toBe(7);
  });
});

describe("findConflicts", () => {
  const base = { availability: [] as AvailabilityRow[], timeOff: [] as TimeOffRow[], minRestHours: 11 };

  it("blocks a shift inside stated unavailability", () => {
    const s = shift({ date: "2026-09-15", start_min: 9 * 60, end_min: 17 * 60 }); // a Tuesday
    const availability: AvailabilityRow[] = [
      { employee_id: "e1", weekday: 1, start_min: 13 * 60, end_min: 18 * 60, kind: "unavailable" },
    ];
    const found = findConflicts({ ...base, shifts: [s], employees: [person()], availability });
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("unavailable");
    expect(found[0].severity).toBe("block");
    expect(found[0].message).toContain("Sam");
  });

  it("ignores a preference, which is not a promise", () => {
    const availability: AvailabilityRow[] = [
      { employee_id: "e1", weekday: 1, start_min: 0, end_min: 1440, kind: "preferred" },
    ];
    expect(findConflicts({ ...base, shifts: [shift()], employees: [person()], availability })).toHaveLength(0);
  });

  it("ignores unavailability on a different weekday", () => {
    const availability: AvailabilityRow[] = [
      { employee_id: "e1", weekday: 4, start_min: 0, end_min: 1440, kind: "unavailable" },
    ];
    expect(findConflicts({ ...base, shifts: [shift()], employees: [person()], availability })).toHaveLength(0);
  });

  it("blocks a shift inside approved leave and lets a pending request through", () => {
    const off = (status: string): TimeOffRow => ({
      employee_id: "e1",
      start_date: "2026-09-14",
      end_date: "2026-09-18",
      kind: "holiday",
      status,
    });
    const approved = findConflicts({ ...base, shifts: [shift()], employees: [person()], timeOff: [off("approved")] });
    expect(approved.map((c) => c.kind)).toEqual(["time-off"]);
    expect(findConflicts({ ...base, shifts: [shift()], employees: [person()], timeOff: [off("pending")] })).toHaveLength(0);
  });

  it("blocks a double booking", () => {
    const shifts = [
      shift({ id: "a", start_min: 9 * 60, end_min: 17 * 60 }),
      shift({ id: "b", start_min: 16 * 60, end_min: 20 * 60 }),
    ];
    const found = findConflicts({ ...base, shifts, employees: [person()] });
    expect(found.map((c) => c.kind)).toEqual(["double-booked"]);
    expect(found[0].shift_id).toBe("b");
  });

  it("does not double-book two people onto overlapping shifts", () => {
    const shifts = [
      shift({ id: "a", employee_id: "e1", start_min: 9 * 60, end_min: 17 * 60 }),
      shift({ id: "b", employee_id: "e2", start_min: 9 * 60, end_min: 17 * 60 }),
    ];
    const found = findConflicts({ ...base, shifts, employees: [person(), person({ id: "e2", name: "Alex" })] });
    expect(found).toHaveLength(0);
  });

  it("warns about a clopening: a close followed by an open inside the rest rule", () => {
    const shifts = [
      shift({ id: "a", date: "2026-09-15", start_min: 16 * 60, end_min: 23 * 60 }),
      shift({ id: "b", date: "2026-09-16", start_min: 6 * 60, end_min: 14 * 60 }),
    ];
    const found = findConflicts({ ...base, shifts, employees: [person()] });
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("rest");
    expect(found[0].severity).toBe("warn");
    expect(found[0].message).toContain("7h");
  });

  it("accepts the same pair once the rest rule is relaxed below the gap", () => {
    const shifts = [
      shift({ id: "a", date: "2026-09-15", start_min: 16 * 60, end_min: 23 * 60 }),
      shift({ id: "b", date: "2026-09-16", start_min: 6 * 60, end_min: 14 * 60 }),
    ];
    expect(findConflicts({ ...base, minRestHours: 6, shifts, employees: [person()] })).toHaveLength(0);
  });

  it("warns once a week goes past a personal hours cap", () => {
    const shifts = weekDates("2026-09-14")
      .slice(0, 5)
      .map((date, i) => shift({ id: `s${i}`, date, break_min: 0 })); // 5 x 8h = 40h
    const found = findConflicts({ ...base, shifts, employees: [person({ max_hours: 32 })] });
    expect(found.map((c) => c.kind)).toEqual(["over-hours"]);
    expect(found[0].message).toContain("40h");
  });

  it("leaves an unlimited contract alone at the same hours", () => {
    const shifts = weekDates("2026-09-14")
      .slice(0, 5)
      .map((date, i) => shift({ id: `s${i}`, date, break_min: 0 }));
    expect(findConflicts({ ...base, shifts, employees: [person({ max_hours: 0 })] })).toHaveLength(0);
  });

  it("says nothing at all about an open shift", () => {
    const availability: AvailabilityRow[] = [
      { employee_id: "e1", weekday: 1, start_min: 0, end_min: 1440, kind: "unavailable" },
    ];
    const found = findConflicts({ ...base, shifts: [shift({ employee_id: null })], employees: [person()], availability });
    expect(found).toHaveLength(0);
  });
});

describe("weekCost", () => {
  const five = (over: Partial<ShiftRow> = {}) =>
    weekDates("2026-09-14")
      .slice(0, 5)
      .map((date, i) => shift({ id: `s${i}`, date, break_min: 0, ...over }));

  it("multiplies hours by the rate", () => {
    const { total, hours, lines } = weekCost(five(), [person()], { overtimeAfter: 0, overtimeRate: 150 });
    expect(hours).toBe(40);
    expect(total).toBe(40 * 1200);
    expect(lines[0].overtime_hours).toBe(0);
  });

  it("pays the overtime multiplier past the threshold", () => {
    const { total, lines } = weekCost(five(), [person()], { overtimeAfter: 35, overtimeRate: 150 });
    expect(lines[0].overtime_hours).toBe(5);
    expect(total).toBe(Math.round(35 * 1200 + 5 * 1200 * 1.5));
  });

  it("skips anyone with no shifts, so the list is the week and not the roster", () => {
    const { lines } = weekCost(five(), [person(), person({ id: "e2", name: "Alex" })], {
      overtimeAfter: 40,
      overtimeRate: 150,
    });
    expect(lines.map((l) => l.employee_id)).toEqual(["e1"]);
  });

  it("charges nothing for an open shift, because nobody is being paid for it", () => {
    const { total, hours } = weekCost([shift({ employee_id: null, break_min: 0 })], [person()], {
      overtimeAfter: 40,
      overtimeRate: 150,
    });
    expect(hours).toBe(0);
    expect(total).toBe(0);
  });

  it("totals exactly the sum of the lines it displays", () => {
    const shifts = [...five(), ...five({ employee_id: "e2" }).map((s, i) => ({ ...s, id: `t${i}` }))];
    const people = [person(), person({ id: "e2", name: "Alex", hourly_rate: 1750 })];
    const { lines, total } = weekCost(shifts, people, { overtimeAfter: 40, overtimeRate: 150 });
    expect(lines.reduce((n, l) => n + l.cost, 0)).toBe(total);
  });
});

describe("hoursByEmployee", () => {
  it("adds a person's week up and leaves open shifts out", () => {
    const shifts = [
      shift({ id: "a", break_min: 0 }),
      shift({ id: "b", date: "2026-09-16", break_min: 0 }),
      shift({ id: "c", employee_id: null, break_min: 0 }),
    ];
    expect(hoursByEmployee(shifts).get("e1")).toBe(16);
    expect(hoursByEmployee(shifts).has("null")).toBe(false);
  });
});

describe("noticeHours", () => {
  it("is positive before the shift and negative once it has started", () => {
    const at = new Date("2026-09-15T12:00:00Z");
    expect(noticeHours("2026-09-16", 12 * 60, at)).toBe(24);
    expect(noticeHours("2026-09-15", 9 * 60, at)).toBe(-3);
  });
});

describe("clock", () => {
  it("pads to a 24-hour wall clock", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(9 * 60 + 5)).toBe("09:05");
    expect(clock(23 * 60 + 59)).toBe("23:59");
  });

  it("wraps a time past midnight rather than printing 24:00", () => {
    expect(clock(1440)).toBe("00:00");
    expect(clock(1500)).toBe("01:00");
  });
});
