import { pgTable, serial, text, integer, real, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Ad-platform integration layer (Meta / Google Ads / GA4).
 * Connections hold encrypted OAuth tokens (server-side only).
 * Daily metrics are the timeseries source for dashboards & client charts —
 * dashboards never call platform APIs directly.
 */

export const adConnectionsTable = pgTable("ad_connections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  platform: text("platform").notNull(), // meta|google_ads|ga4
  status: text("status").notNull().default("connected"), // connected|expired|error|disconnected
  accountLabel: text("account_label"), // human-readable e.g. "Targetgum Meta Business"
  // AES-256-GCM encrypted JSON blob: { accessToken, refreshToken?, expiresAt? }
  credentialsEnc: text("credentials_enc").notNull(),
  scopes: text("scopes"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastError: text("last_error"),
  connectedByUserId: integer("connected_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const adAccountsTable = pgTable("ad_accounts", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull(),
  companyId: integer("company_id").notNull(),
  platform: text("platform").notNull(),
  externalId: text("external_id").notNull(), // act_… / customer id / GA4 property id
  name: text("name"),
  currency: text("currency"),
  status: text("status").notNull().default("active"), // active|disabled
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ad_accounts_conn_ext_uniq").on(t.connectionId, t.externalId),
]);

/** One row per campaign per day per source — the dedupe boundary for syncs. */
export const campaignDailyMetricsTable = pgTable("campaign_daily_metrics", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  campaignId: integer("campaign_id").notNull(), // FK to campaigns.id
  date: text("date").notNull(), // YYYY-MM-DD (platform-local reporting date)
  source: text("source").notNull().default("manual"), // manual|meta|google_ads|ga4
  spend: real("spend").notNull().default(0),
  revenue: real("revenue").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("campaign_daily_metrics_uniq").on(t.campaignId, t.date, t.source),
]);

/**
 * One row per GA4 property per day — website analytics (not ad-attributed).
 * Kept separate from campaign_daily_metrics because these are site-wide
 * numbers with no campaign identity.
 */
export const siteDailyMetricsTable = pgTable("site_daily_metrics", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  propertyId: text("property_id").notNull(), // GA4 property id
  date: text("date").notNull(), // YYYY-MM-DD
  sessions: integer("sessions").notNull().default(0),
  users: integer("users").notNull().default(0),
  conversions: real("conversions").notNull().default(0), // GA4 key events
  revenue: real("revenue").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  // company_id is part of the key: the same GA4 property connected to two
  // companies must never share (and overwrite) one row across tenants.
  uniqueIndex("site_daily_metrics_uniq").on(t.companyId, t.propertyId, t.date),
]);

export const syncJobsTable = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull(),
  companyId: integer("company_id").notNull(),
  platform: text("platform").notNull(),
  trigger: text("trigger").notNull().default("scheduled"), // scheduled|manual
  status: text("status").notNull().default("running"), // running|success|partial|failed
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  error: text("error"),
});

export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  level: text("level").notNull().default("info"), // info|warn|error
  message: text("message").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Generated marketing reports; clients may only see approved ones. */
export const marketingReportsTable = pgTable("marketing_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  companyId: integer("company_id").notNull(),
  type: text("type").notNull().default("custom"), // weekly|monthly|campaign|custom
  title: text("title").notNull(),
  periodFrom: text("period_from").notNull(), // YYYY-MM-DD
  periodTo: text("period_to").notNull(),
  status: text("status").notNull().default("draft"), // draft|approved|archived
  // Snapshot of the report payload at generation time (client-safe fields only).
  payload: jsonb("payload"),
  pdfPath: text("pdf_path"), // /objects/... or null until rendered
  generatedByUserId: integer("generated_by_user_id"),
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdConnectionSchema = createInsertSchema(adConnectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCampaignDailyMetricSchema = createInsertSchema(campaignDailyMetricsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMarketingReportSchema = createInsertSchema(marketingReportsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type AdConnection = typeof adConnectionsTable.$inferSelect;
export type AdAccount = typeof adAccountsTable.$inferSelect;
export type CampaignDailyMetric = typeof campaignDailyMetricsTable.$inferSelect;
export type InsertCampaignDailyMetric = z.infer<typeof insertCampaignDailyMetricSchema>;
export type SyncJob = typeof syncJobsTable.$inferSelect;
export type MarketingReport = typeof marketingReportsTable.$inferSelect;
