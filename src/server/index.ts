// OpenShifts — the API.
//
// `createApp` brings the OpenAPI router, the per-request database wiring, and
// the two discovery routes (`/api/openapi.json`, `/llms.txt`) that let the org's
// agent learn this API without anyone writing it down twice.

import { createApp } from "@clawnify/app";
import type { Env } from "./env.js";
import { registerEmployees } from "./routes/employees.js";
import { registerShifts } from "./routes/shifts.js";
import { registerRequests } from "./routes/requests.js";
import { registerTimeclock } from "./routes/timeclock.js";
import { registerInsights } from "./routes/insights.js";
import { registerSettings } from "./routes/settings.js";
import { registerPublic } from "./routes/public.js";

const app = createApp<Env>({
  title: "OpenShifts",
  version: "1.0.0",
  description:
    "Scheduling, time tracking and shift swaps for shift teams. A published week is a promise: once it is published, every change to it is recorded with who made it and how much notice the person got, and the team sees that record on the same page as the rota.",
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || String(err) }, 500);
});

registerSettings(app);
registerEmployees(app);
registerShifts(app);
registerRequests(app);
registerTimeclock(app);
registerInsights(app);

// Last, and off the OpenAPI surface: the team's read-only page. Registered
// after the authenticated routes so a public path can never shadow one.
registerPublic(app);

export default app;
