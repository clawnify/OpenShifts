// One fetch wrapper. Auth is the platform's job at the perimeter, so there is
// no token to attach here and no login to build.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/* ── shapes ────────────────────────────────────────────────────────────── */

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  hourly_rate: number;
  contract_hours: number;
  max_hours: number;
  active: number;
  note: string;
}

export interface Availability {
  id: string;
  employee_id: string;
  weekday: number;
  start_min: number;
  end_min: number;
  kind: string;
  note: string;
}

export interface Shift {
  id: string;
  week_start: string;
  date: string;
  start_min: number;
  end_min: number;
  break_min: number;
  role: string;
  employee_id: string | null;
  note: string;
}

export interface Conflict {
  shift_id: string;
  employee_id: string;
  kind: string;
  message: string;
  severity: "block" | "warn";
}

export interface Change {
  id: string;
  kind: string;
  detail: string;
  actor: string;
  employee_id: string | null;
  notice_hours: number | null;
  at: string;
}

export interface CostLine {
  employee_id: string;
  name: string;
  hours: number;
  overtime_hours: number;
  cost: number;
}

export interface Week {
  week_start: string;
  dates: string[];
  published_at: string | null;
  published_by: string;
  budget: number;
  shifts: Shift[];
  employees: (Employee & { hours: number })[];
  employees_total: number;
  conflicts: Conflict[];
  cost: { total: number; hours: number; lines: CostLine[] };
  changes: Change[];
  open_shifts: number;
  currency: string;
}

export interface TimeOff {
  id: string;
  employee_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  kind: string;
  status: string;
  note: string;
  created_at: string;
}

export interface Swap {
  id: string;
  shift_id: string;
  from_employee_id: string | null;
  from_name: string;
  to_employee_id: string | null;
  to_name: string;
  status: string;
  reason: string;
  shift_label: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  shift_id: string | null;
  date: string;
  clock_in: number;
  clock_out: number | null;
  break_min: number;
  source: string;
  status: string;
  note: string;
  hours: number;
  scheduled_hours: number | null;
  variance_hours: number | null;
}

export interface Settings {
  business_name: string;
  min_rest_hours: number;
  overtime_after: number;
  overtime_rate: number;
  currency: string;
  share_token: string;
  show_changes: number;
}

export interface Summary {
  business_name: string;
  this_week: string;
  published: boolean;
  shifts: number;
  open_shifts: number;
  pending_time_off: number;
  pending_swaps: number;
  on_clock: number;
  unapproved_entries: number;
  active_people: number;
}

export interface Insights {
  weeks: {
    week_start: string;
    published_at: string | null;
    budget: number;
    shifts: number;
    open_shifts: number;
    late_changes: number;
    short_notice: number;
  }[];
  reliability: {
    published_weeks: number;
    late_changes: number;
    short_notice: number;
    median_notice_hours: number | null;
  };
  top_hours: { employee_id: string; name: string; hours: number }[];
  currency: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") out.set(k, String(v));
  const s = out.toString();
  return s ? `?${s}` : "";
};

export const api = {
  summary: () => request<Summary>("/api/summary"),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (body: Partial<Omit<Settings, "show_changes">> & { show_changes?: boolean }) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  rotateLink: () => request<{ share_token: string }>("/api/settings/rotate-link", { method: "POST" }),
  shareLink: () => request<{ url: string; token: string }>("/api/share-link"),

  week: (weekStart?: string) => request<Week>(`/api/week${qs({ week_start: weekStart, limit: 100 })}`),
  publish: (weekStart: string, published: boolean) =>
    request<{ published_at: string | null }>("/api/week/publish", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart, published }),
    }),
  setBudget: (weekStart: string, budget: number) =>
    request<{ ok: boolean }>("/api/week/budget", { method: "PUT", body: JSON.stringify({ week_start: weekStart, budget }) }),
  copyWeek: (from: string, to: string, keepPeople: boolean) =>
    request<{ copied: number }>("/api/week/copy", {
      method: "POST",
      body: JSON.stringify({ from, to, keep_people: keepPeople }),
    }),

  createShift: (body: Partial<Shift>) => request<Shift>("/api/shifts", { method: "POST", body: JSON.stringify(body) }),
  updateShift: (id: string, body: Partial<Shift>) =>
    request<Shift>(`/api/shifts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteShift: (id: string) => request<{ ok: boolean }>(`/api/shifts/${id}`, { method: "DELETE" }),

  employees: (search?: string, page = 1) => request<Page<Employee>>(`/api/employees${qs({ search, page, limit: 100 })}`),
  createEmployee: (body: Partial<Employee>) => request<Employee>("/api/employees", { method: "POST", body: JSON.stringify(body) }),
  updateEmployee: (id: string, body: Partial<Employee> & { active?: boolean }) =>
    request<Employee>(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEmployee: (id: string) => request<{ ok: boolean }>(`/api/employees/${id}`, { method: "DELETE" }),

  availability: (employeeId: string) => request<{ items: Availability[] }>(`/api/employees/${employeeId}/availability`),
  addAvailability: (employeeId: string, body: Partial<Availability>) =>
    request<Availability>(`/api/employees/${employeeId}/availability`, { method: "POST", body: JSON.stringify(body) }),
  dropAvailability: (id: string) => request<{ ok: boolean }>(`/api/availability/${id}`, { method: "DELETE" }),

  timeOff: (status?: string) => request<Page<TimeOff>>(`/api/time-off${qs({ status, limit: 50 })}`),
  createTimeOff: (body: Partial<TimeOff>) => request<TimeOff>("/api/time-off", { method: "POST", body: JSON.stringify(body) }),
  decideTimeOff: (id: string, status: string) =>
    request<TimeOff>(`/api/time-off/${id}/decide`, { method: "POST", body: JSON.stringify({ status }) }),
  deleteTimeOff: (id: string) => request<{ ok: boolean }>(`/api/time-off/${id}`, { method: "DELETE" }),

  swaps: (status?: string) => request<Page<Swap>>(`/api/swaps${qs({ status, limit: 50 })}`),
  createSwap: (shiftId: string, toEmployeeId: string | null, reason: string) =>
    request<Swap>("/api/swaps", {
      method: "POST",
      body: JSON.stringify({ shift_id: shiftId, to_employee_id: toEmployeeId, reason }),
    }),
  claimSwap: (id: string, toEmployeeId: string) =>
    request<Swap>(`/api/swaps/${id}/claim`, { method: "POST", body: JSON.stringify({ to_employee_id: toEmployeeId }) }),
  decideSwap: (id: string, status: string) =>
    request<Swap>(`/api/swaps/${id}/decide`, { method: "POST", body: JSON.stringify({ status }) }),

  entries: (params: { status?: string; from?: string; to?: string } = {}) =>
    request<Page<TimeEntry> & { on_clock: number }>(`/api/time-entries${qs({ ...params, limit: 50 })}`),
  clockIn: (employeeId: string, shiftId: string | null) =>
    request<TimeEntry>("/api/time-entries/clock-in", {
      method: "POST",
      body: JSON.stringify({ employee_id: employeeId, shift_id: shiftId }),
    }),
  clockOut: (employeeId: string, breakMin: number) =>
    request<TimeEntry>("/api/time-entries/clock-out", {
      method: "POST",
      body: JSON.stringify({ employee_id: employeeId, break_min: breakMin }),
    }),
  updateEntry: (id: string, body: Partial<TimeEntry> & { status?: string }) =>
    request<TimeEntry>(`/api/time-entries/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEntry: (id: string) => request<{ ok: boolean }>(`/api/time-entries/${id}`, { method: "DELETE" }),

  insights: (weeks = 8) => request<Insights>(`/api/insights${qs({ weeks })}`),
};
