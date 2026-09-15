// The pieces every screen shares: the toolbar grammar, cards, stat tiles and
// the empty states. Kept in one file so the grammar is visible in one place
// rather than reconstructed screen by screen.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Row one is identity, row two is the state of the view.
 *
 * Left of row two names what you are looking at ("Week of 14 Sep"), right is
 * settings and then the single ink action. The two sides never mix.
 */
export function Toolbar({ title, subtitle, actions, view }: { title: string; subtitle?: string; actions?: ReactNode; view?: ReactNode }) {
  return (
    <div className="border-b border-border">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {view && <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-2.5">{view}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5", className)}>
      {title && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.0625rem] font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Value first, label under, and tinted only when the number is itself a status.
 * If every tile is coloured none of them says anything.
 */
export function Tile({ label, value, meta, tone }: { label: string; value: ReactNode; meta?: string; tone?: "success" | "warning" | "danger" | "info" }) {
  const tinted = {
    success: "bg-success-tint text-success",
    warning: "bg-warning-tint text-warning",
    danger: "bg-danger-tint text-danger",
    info: "bg-info-tint text-info",
  };
  return (
    <div className={cn("rounded-md px-3 py-2.5", tone ? tinted[tone] : "card")}>
      <div className="tnum text-[1.375rem] font-semibold leading-tight">{value}</div>
      <div className={cn("mt-0.5 text-[0.8125rem] font-medium", tone ? "opacity-80" : "text-muted")}>{label}</div>
      <div className={cn("mt-0.5 h-4 text-xs", tone ? "opacity-70" : "text-muted")}>{meta ?? ""}</div>
    </div>
  );
}

/** Never a bare "No data": say what is missing and offer the way forward. */
export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

/** The shape of the answer, not a spinner. */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-sm bg-sunken" />
      ))}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-6 mt-4 rounded-sm bg-danger-tint px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}

/** A band that splits a run of rows, with its count beside the label. */
export function GroupHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-sm bg-sunken px-3 py-1.5 text-[0.8125rem] font-medium text-muted">
      <span>{label}</span>
      {count !== undefined && <span className="tnum">· {count}</span>}
    </div>
  );
}
