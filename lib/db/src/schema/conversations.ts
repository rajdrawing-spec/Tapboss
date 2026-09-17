import { serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { tbosSchema } from "./_pg-schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversations = tbosSchema.table("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  /** Local user ID of the conversation owner — conversations are private per user. */
  ownerUserId: integer("owner_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
