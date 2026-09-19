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
  // All TBOS tables live in the "tbos" Postgres schema (see schema/_pg-schema.ts)
  // rather than "public" — this project's "public" schema belongs to an
  // unrelated site and has same-named tables (orders, products, messages) with
  // incompatible columns. Drizzle's own queries are already schema-qualified
  // via that table object, but raw `sql` fragments elsewhere in this codebase
  // use bare table names, so every connection must resolve them against "tbos"
  // only — never falling back to "public" — or a typo could silently read/write
  // the wrong business's data instead of failing loudly.
  options: "-c search_path=tbos",
});

export const db = drizzle(pool, { schema });

export * from "./schema";
