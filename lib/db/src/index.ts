import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

// SUPABASE_DB_URL is the persistent Supabase database — unaffected by
// Replit's publish-time "overwrite with dev data" flow.
// In production it is required; in development we fall back to Replit's
// managed DATABASE_URL so local dev still works without the secret.
const isSupabase = !!process.env.SUPABASE_DB_URL;
const connectionString = process.env.SUPABASE_DB_URL ||
  (!isProduction ? process.env.DATABASE_URL : undefined);

if (!connectionString) {
  throw new Error(
    isProduction
      ? "SUPABASE_DB_URL must be set in production. Check your deployment secrets."
      : "SUPABASE_DB_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString,
  // Supabase requires SSL. Enforce it explicitly as a safety net even when
  // sslmode is already present in the URL.
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  // Supabase free tier allows ~60 direct connections. Keep pool small for
  // autoscale deployments where multiple instances may be running.
  max: isSupabase ? 5 : 10,
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
