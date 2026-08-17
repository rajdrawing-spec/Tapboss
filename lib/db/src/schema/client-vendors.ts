import { pgTable, serial, text, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Unified Clients & Vendors relationship directory (multi-company PRD).
 * Each row belongs to exactly one sub-company. This is additive and separate
 * from the legacy `customers` (CRM buyers) and `vendors` (procurement) tables.
 */
export const clientVendorsTable = pgTable("client_vendors", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  type: text("type").notNull(), // client|vendor
  name: text("name").notNull(),
  organizationName: text("organization_name"),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  website: text("website"),
  address: text("address"),
  notes: text("notes"),
  status: text("status").notNull().default("active"), // active|inactive
  customFields: jsonb("custom_fields").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("client_vendors_company_idx").on(t.companyId),
  index("client_vendors_type_idx").on(t.type),
]);

/**
 * Optional row-level restriction: user -> specific client/vendor rows.
 * No rows for a user = no restriction (sees all clients/vendors permitted by
 * their company scope + module permissions, per role default).
 */
export const userClientVendorAccessTable = pgTable("user_client_vendor_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clientVendorId: integer("client_vendor_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("user_cv_access_unique").on(t.userId, t.clientVendorId),
  index("user_cv_access_user_idx").on(t.userId),
]);

export const insertClientVendorSchema = createInsertSchema(clientVendorsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    type: z.enum(["client", "vendor"]),
    status: z.enum(["active", "inactive"]).default("active"),
    customFields: z.record(z.string(), z.string()).nullish(),
  });
export const updateClientVendorSchema = insertClientVendorSchema.partial().omit({ companyId: true });

export type ClientVendor = typeof clientVendorsTable.$inferSelect;
export type InsertClientVendor = z.infer<typeof insertClientVendorSchema>;
export type UserClientVendorAccess = typeof userClientVendorAccessTable.$inferSelect;
