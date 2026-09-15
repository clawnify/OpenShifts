// The vocabulary every route module imports: bindings, the app type, and the
// few helpers that would otherwise be rewritten per file.

import { OpenAPIHono, z } from "@clawnify/app";

export interface Env {
  Bindings: {
    DB: D1Database;
    /** Minted per org by the platform. Present in production, absent locally. */
    CLAWNIFY_TOKEN?: string;
  };
}

export type App = OpenAPIHono<Env>;

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");
export const OkSchema = z.object({ ok: z.boolean() }).openapi("Ok");

export const PaginationQuery = z.object({
  page: z.string().optional().openapi({ description: "Page number (default: 1)" }),
  limit: z.string().optional().openapi({ description: "Items per page (default: 25, max: 100)" }),
  search: z.string().optional().openapi({ description: "Filter by name" }),
});

export function paginate(q: { page?: string; limit?: string }, fallback = 25): { limit: number; offset: number; page: number } {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || fallback));
  return { page, limit, offset: (page - 1) * limit };
}

export function ok<T extends z.ZodTypeAny>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}

export function fail(description: string) {
  return { description, content: { "application/json": { schema: ErrorSchema } } };
}

/** A URL-safe token for the team's read-only schedule link. */
export function shareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
