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
});

export const db = drizzle(pool, { schema });

export * from "./schema";
