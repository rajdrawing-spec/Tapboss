import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const isSupabase = !!process.env.SUPABASE_DB_URL;
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or SUPABASE_DB_URL) must be set. Did you configure the PostgreSQL connection?",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || (isSupabase ? 5 : 10)),
  // node-postgres has no connect timeout by default, so an unreachable host
  // (wrong pooler URL, IPv6-only address the network can't route to, a
  // firewall silently dropping SYN packets) hangs every request on this pool
  // for the OS-level TCP timeout (~2 minutes) instead of failing fast.
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10_000),
  // Every TBOS table lives directly in "public" on the production project
  // (see schema/_pg-schema.ts) — no search_path override needed, Postgres's
  // default ("$user", public) already resolves both Drizzle's queries and the
  // bare-name raw `sql` fragments elsewhere in this codebase correctly.
});

export const db = drizzle(pool, { schema });

export * from "./schema";
