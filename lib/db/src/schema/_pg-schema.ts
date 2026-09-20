import { pgTable } from "drizzle-orm/pg-core";

// The production Supabase project (zybfxgnkozyttrnvxvla) has always kept every
// TBOS table directly in the default "public" schema — there is no separate
// "tbos" schema there, and no unrelated site's tables to collide with. An
// earlier pass in this codebase's history isolated tables under a dedicated
// "tbos" Postgres schema to avoid a naming collision that only existed on a
// *different* Supabase project explored during setup. Aliasing `.table` to
// plain `pgTable` here (unqualified — resolved via the connection's default
// search_path, which includes "public") keeps every schema file below
// unchanged while targeting the schema where the real data actually lives.
export const tbosSchema = { table: pgTable };
