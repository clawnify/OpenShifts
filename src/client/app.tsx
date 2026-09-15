import { useCallback, useEffect, useState } from "react";
import { AppNav, reportLocation, type AppNavItem } from "@clawnify/app/client";
import { Overview } from "./components/overview";
import { Schedule } from "./components/schedule";
import { Team } from "./components/team";
import { Requests } from "./components/requests";
import { Timeclock } from "./components/timeclock";
import { Insights } from "./components/insights";
import { Settings } from "./components/settings";
import { ErrorBanner } from "./components/shell";
import { api, type Summary, type Week } from "./api";
import { today, weekStartOf } from "@/lib/format";

type View = "overview" | "schedule" | "team" | "requests" | "timeclock" | "insights" | "settings";

const PATHS: Record<View, string> = {
  overview: "/",
  schedule: "/schedule",
  team: "/team",
  requests: "/requests",
  timeclock: "/timeclock",
  insights: "/insights",
  settings: "/settings",
};

function viewOf(path: string): View {
  const hit = (Object.keys(PATHS) as View[]).find((v) => PATHS[v] === path);
  return hit ?? "overview";
}

export function App() {
  const [view, setView] = useState<View>(() => viewOf(window.location.pathname));
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today()));
  const [week, setWeek] = useState<Week | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onError = useCallback((message: string) => setError(message), []);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.summary());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadWeek = useCallback(async (start: string) => {
    setLoadingWeek(true);
    try {
      setWeek(await api.week(start));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingWeek(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    reportLocation(window.location.pathname);
  }, [loadSummary]);

  useEffect(() => {
    void loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  // Back and forward move between screens rather than out of the app.
  useEffect(() => {
    const onPop = () => setView(viewOf(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((next: View) => {
    const path = PATHS[next];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    reportLocation(path);
    setView(next);
  }, []);

  // Data-driven counts: the badges are state, so both this sidebar and the
  // dashboard's copy of it update in the same tick with no extra call.
  const waiting = (summary?.pending_time_off ?? 0) + (summary?.pending_swaps ?? 0);
  const nav: AppNavItem[] = [
    { id: "overview", label: "Overview", href: "/", home: true },
    { id: "schedule", label: "Schedule", href: "/schedule", icon: "calendar-days", color: "blue", count: week?.open_shifts || undefined },
    { id: "team", label: "Team", href: "/team", icon: "users", color: "violet" },
    { id: "requests", label: "Requests", href: "/requests", icon: "inbox", color: "amber", count: waiting || undefined },
    { id: "timeclock", label: "Time clock", href: "/timeclock", icon: "clock", color: "green", count: summary?.on_clock || undefined },
    { id: "insights", label: "Insights", href: "/insights", icon: "bar-chart-3", color: "sky" },
    { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  ];

  const refreshAll = useCallback(() => {
    void loadWeek(weekStart);
    void loadSummary();
  }, [loadWeek, weekStart, loadSummary]);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <AppNav
        title="OpenShifts"
        icon="calendar-days"
        groups={[{ items: nav }]}
        active={view}
        onNavigate={(item) => go(item.id as View)}
      />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {error && <ErrorBanner message={error} />}

        {view === "overview" && <Overview summary={summary} loading={loadingSummary} onGo={(id) => go(id as View)} />}
        {view === "schedule" && (
          <Schedule
            week={week}
            loading={loadingWeek}
            weekStart={weekStart}
            onWeek={setWeekStart}
            onChanged={refreshAll}
            onError={onError}
          />
        )}
        {view === "team" && <Team currency={week?.currency ?? "EUR"} onError={onError} />}
        {view === "requests" && <Requests onError={onError} onChanged={refreshAll} />}
        {view === "timeclock" && <Timeclock onError={onError} />}
        {view === "insights" && <Insights onError={onError} />}
        {view === "settings" && <Settings onError={onError} onSaved={refreshAll} />}
      </main>
    </div>
  );
}
