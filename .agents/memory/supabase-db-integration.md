---
name: Portable PostgreSQL configuration
description: TAPBOSS can use Supabase or another external PostgreSQL database in self-hosted production.
---

## Rule
Prefer `SUPABASE_DB_URL` when it is configured, preserving the existing
Supabase production database. Self-hosted production may instead use a standard
`DATABASE_URL` for another external PostgreSQL provider.

## Why
Hostinger/self-hosted deployments are outside Replit's database lifecycle, so
the runtime must accept a provider-neutral PostgreSQL connection without
forcing a Supabase-specific variable.

## How to apply
- Prefer `SUPABASE_DB_URL` when preserving the current Supabase production DB;
  otherwise set `DATABASE_URL` to the chosen external PostgreSQL service.
- SSL is enabled by default for hosted databases. Disable it only for a trusted
  local database, and keep the pool small enough for the provider's limits.
- `executeSql({ environment: "production" })` in CodeExecution still queries Replit's managed prod DB replica — it does NOT query Supabase. Use the app's own API or a direct pg connection for Supabase queries.
- Keep the Supabase pool default small; other providers can tune the pool with
  the documented environment variable.
- `drizzle-kit push` automatically targets Supabase when SUPABASE_DB_URL is set.
- Schema was pushed to Supabase via `drizzle-kit push --force` and boot seed seeded 8 companies + 12 roles.
