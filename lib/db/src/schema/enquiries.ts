import { serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { tbosSchema } from "./_pg-schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Submissions from the public "Work With Us" enquiry form on tapashub.com. */
export const enquiriesTable = tbosSchema.table("enquiries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  interest: text("interest"),
  message: text("message").notNull(),
  budget: text("budget"),
  status: text("status").notNull().default("new"), // new | reviewed | archived
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("enquiries_status_idx").on(t.status),
  index("enquiries_created_at_idx").on(t.createdAt),
]);

export const insertEnquirySchema = createInsertSchema(enquiriesTable).omit({
  id: true,
  status: true,
  createdAt: true,
});
export type InsertEnquiry = z.infer<typeof insertEnquirySchema>;
export type Enquiry = typeof enquiriesTable.$inferSelect;
