import { pgSchema } from "drizzle-orm/pg-core";

// This Supabase project also hosts an unrelated site's database, whose tables
// live in the default "public" schema (some of them — products, orders,
// messages — collide by name with tables TBOS needs). Every TBOS table lives
// in this dedicated schema instead, so names can never collide and the two
// businesses' data stays structurally isolated even while sharing a project.
export const tbosSchema = pgSchema("tbos");
