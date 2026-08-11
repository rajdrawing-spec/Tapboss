/**
 * Ad-platform sync engine (Phase 2: Meta Ads).
 *
 * Dashboards NEVER call platform APIs directly — scheduled jobs (08/12/16/20)
 * and "Sync Now" pull daily campaign metrics into campaign_daily_metrics,
 * deduped by the (campaign_id, date, source) unique index. Campaign lifetime
 * aggregates are recomputed from the daily rows after each sync.
 *
 * Credentials are stored AES-256-GCM encrypted (same key derivation as the
 * integration credential store); tokens never reach the frontend.
 */
import { schedule } from "node-cron";
import {
  db, adConnectionsTable, adAccountsTable, campaignsTable,
  campaignDailyMetricsTable, syncJobsTable, syncLogsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { encryptValue, decryptValue } from "./credential-store";
import { logger } from "./logger";

/* ------------------------- credential handling ------------------------- */

export interface AdCredentials { accessToken: string; refreshToken?: string; expiresAt?: string }

export function encryptCredentials(creds: AdCredentials): string {
  const { encryptedValue, iv } = encryptValue(JSON.stringify(creds));
  return `${iv}:${encryptedValue}`;
}

export function decryptCredentials(enc: string): AdCredentials {
  const idx = enc.indexOf(":");
  return JSON.parse(decryptValue(enc.slice(idx + 1), enc.slice(0, idx)));
}

/* ----------------------------- Meta client ----------------------------- */

const META_API = "https://graph.facebook.com/v21.0";

async function metaGet(path: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${META_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  let attempt = 0;
  for (;;) {
    const res = await fetch(url);
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const code = body?.error?.code;
    // 4/17/32/613 are Meta rate-limit codes — retry with backoff (max 3).
    if ([4, 17, 32, 613].includes(code) && attempt < 3) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }
    const err = new Error(body?.error?.message || `Meta API error (HTTP ${res.status})`);
    (err as any).metaCode = code;
    throw err;
  }
}

/** Validate a token and list its ad accounts (used at connect time). */
export async function metaListAdAccounts(token: string): Promise<{ externalId: string; name: string; currency: string }[]> {
  const data = await metaGet("/me/adaccounts", token, { fields: "id,name,currency,account_status", limit: "100" });
  return (data.data ?? []).map((a: any) => ({ externalId: a.id, name: a.name, currency: a.currency }));
}

interface MetaDailyRow {
  campaign_id: string; campaign_name: string; date_start: string;
  spend?: string; impressions?: string; reach?: string; clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

function actionCount(row: MetaDailyRow, types: string[]): number {
  let n = 0;
  for (const a of row.actions ?? []) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

function actionValue(row: MetaDailyRow, types: string[]): number {
  let n = 0;
  for (const a of row.action_values ?? []) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

/* ------------------------------ sync core ------------------------------ */

async function log(jobId: number, level: string, message: string, detail?: unknown) {
  try {
    await db.insert(syncLogsTable).values({ jobId, level, message, detail: detail ?? null });
  } catch { /* logging must never break a sync */ }
}

/** Upsert one daily metric row (dedupe on campaign_id+date+source). */
async function upsertDaily(row: {
  companyId: number; campaignId: number; date: string; source: string;
  spend: number; revenue: number; impressions: number; reach: number;
  clicks: number; leads: number; conversions: number;
}): Promise<void> {
  await db.insert(campaignDailyMetricsTable).values(row).onConflictDoUpdate({
    target: [campaignDailyMetricsTable.campaignId, campaignDailyMetricsTable.date, campaignDailyMetricsTable.source],
    set: {
      spend: row.spend, revenue: row.revenue, impressions: row.impressions, reach: row.reach,
      clicks: row.clicks, leads: row.leads, conversions: row.conversions, updatedAt: new Date(),
    },
  });
}

/** Recompute a campaign's lifetime aggregates from its daily rows. */
async function refreshCampaignAggregates(campaignId: number): Promise<void> {
  const [agg] = await db.select({
    spend: sql<number>`COALESCE(SUM(spend), 0)`,
    revenue: sql<number>`COALESCE(SUM(revenue), 0)`,
    impressions: sql<number>`COALESCE(SUM(impressions), 0)`,
    clicks: sql<number>`COALESCE(SUM(clicks), 0)`,
    leads: sql<number>`COALESCE(SUM(leads), 0)`,
    conversions: sql<number>`COALESCE(SUM(conversions), 0)`,
  }).from(campaignDailyMetricsTable).where(eq(campaignDailyMetricsTable.campaignId, campaignId));
  await db.update(campaignsTable).set({
    spent: Number(agg.spend) || 0,
    revenue: Number(agg.revenue) || 0,
    impressions: Number(agg.impressions) || 0,
    clicks: Number(agg.clicks) || 0,
    leads: Number(agg.leads) || 0,
    conversions: Number(agg.conversions) || 0,
    updatedAt: new Date(),
  }).where(eq(campaignsTable.id, campaignId));
}

/** Find-or-create the local campaign for a synced platform campaign. */
async function resolveLocalCampaign(companyId: number, adAccountId: number, externalId: string, name: string, channel: string): Promise<number> {
  const [existing] = await db.select().from(campaignsTable)
    .where(and(eq(campaignsTable.companyId, companyId), eq(campaignsTable.externalId, externalId)));
  if (existing) {
    if (existing.name !== name || existing.adAccountId !== adAccountId) {
      await db.update(campaignsTable).set({ name, adAccountId, updatedAt: new Date() }).where(eq(campaignsTable.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await db.insert(campaignsTable).values({
    companyId, externalId, adAccountId, name, channel, status: "active",
  }).onConflictDoNothing().returning();
  if (row) return row.id;
  // Concurrent insert won the race — reselect.
  const [again] = await db.select().from(campaignsTable)
    .where(and(eq(campaignsTable.companyId, companyId), eq(campaignsTable.externalId, externalId)));
  return again.id;
}

/** Sync one Meta connection: last N days of daily campaign metrics. */
export async function runMetaSync(connectionId: number, trigger: "scheduled" | "manual", days = 30): Promise<{ jobId: number; status: string; rows: number }> {
  const [conn] = await db.select().from(adConnectionsTable).where(eq(adConnectionsTable.id, connectionId));
  if (!conn) throw new Error("Connection not found");
  const [job] = await db.insert(syncJobsTable).values({
    connectionId, companyId: conn.companyId, platform: conn.platform, trigger, status: "running",
  }).returning();

  let rows = 0;
  let failedAccounts = 0;
  try {
    const creds = decryptCredentials(conn.credentialsEnc);
    const accounts = await db.select().from(adAccountsTable)
      .where(and(eq(adAccountsTable.connectionId, connectionId), eq(adAccountsTable.syncEnabled, true)));
    if (accounts.length === 0) await log(job.id, "warn", "No sync-enabled ad accounts on this connection");

    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 86400000);
    const dstr = (d: Date) => d.toISOString().slice(0, 10);

    for (const account of accounts) {
      try {
        let after: string | undefined;
        do {
          const data = await metaGet(`/${account.externalId}/insights`, creds.accessToken, {
            level: "campaign",
            time_increment: "1",
            fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values",
            time_range: JSON.stringify({ since: dstr(since), until: dstr(until) }),
            limit: "500",
            ...(after ? { after } : {}),
          });
          for (const r of (data.data ?? []) as MetaDailyRow[]) {
            const campaignId = await resolveLocalCampaign(conn.companyId, account.id, r.campaign_id, r.campaign_name, "meta");
            await upsertDaily({
              companyId: conn.companyId,
              campaignId,
              date: r.date_start,
              source: "meta",
              spend: Number(r.spend) || 0,
              revenue: actionValue(r, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
              impressions: Number(r.impressions) || 0,
              reach: Number(r.reach) || 0,
              clicks: Number(r.clicks) || 0,
              leads: actionCount(r, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]),
              conversions: actionCount(r, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
            });
            rows += 1;
          }
          after = data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : undefined;
        } while (after);
        await log(job.id, "info", `Synced account ${account.externalId}`, { account: account.externalId });
      } catch (e: any) {
        failedAccounts += 1;
        await log(job.id, "error", `Account ${account.externalId} failed: ${e.message}`, { metaCode: e.metaCode ?? null });
        // Token problems affect every account — stop early and mark expired.
        if (e.metaCode === 190) {
          await db.update(adConnectionsTable)
            .set({ status: "expired", lastError: "Access token expired — reconnect Meta.", updatedAt: new Date() })
            .where(eq(adConnectionsTable.id, connectionId));
          throw e;
        }
      }
    }

    // Refresh lifetime aggregates for all synced campaigns of this company.
    const synced = await db.select({ id: campaignsTable.id }).from(campaignsTable)
      .where(and(eq(campaignsTable.companyId, conn.companyId), eq(campaignsTable.channel, "meta")));
    for (const c of synced) {
      const [has] = await db.select({ id: campaignDailyMetricsTable.id }).from(campaignDailyMetricsTable)
        .where(eq(campaignDailyMetricsTable.campaignId, c.id)).limit(1);
      if (has) await refreshCampaignAggregates(c.id);
    }

    const status = failedAccounts > 0 ? "partial" : "success";
    await db.update(syncJobsTable).set({ status, finishedAt: new Date(), rowsUpserted: rows }).where(eq(syncJobsTable.id, job.id));
    await db.update(adConnectionsTable)
      .set({ lastSyncedAt: new Date(), lastError: failedAccounts > 0 ? "Some ad accounts failed — see sync logs." : null, status: "connected", updatedAt: new Date() })
      .where(eq(adConnectionsTable.id, connectionId));
    return { jobId: job.id, status, rows };
  } catch (e: any) {
    await db.update(syncJobsTable).set({ status: "failed", finishedAt: new Date(), rowsUpserted: rows, error: e.message }).where(eq(syncJobsTable.id, job.id));
    await db.update(adConnectionsTable)
      .set({ lastError: e.message, updatedAt: new Date() })
      .where(eq(adConnectionsTable.id, connectionId));
    throw e;
  }
}

export async function runSyncForConnection(connectionId: number, trigger: "scheduled" | "manual"): Promise<{ jobId: number; status: string; rows: number }> {
  const [conn] = await db.select().from(adConnectionsTable).where(eq(adConnectionsTable.id, connectionId));
  if (!conn) throw new Error("Connection not found");
  if (conn.platform === "meta") return runMetaSync(connectionId, trigger);
  throw new Error(`Sync for platform "${conn.platform}" is not implemented yet`);
}

/* ------------------------------ scheduler ------------------------------ */

let schedulerStarted = false;

/** PRD schedule: 08:00, 12:00, 16:00 and 20:00 daily (IST). */
export function startAdSyncScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  schedule("0 8,12,16,20 * * *", async () => {
    try {
      const connections = await db.select().from(adConnectionsTable)
        .where(eq(adConnectionsTable.status, "connected"));
      for (const conn of connections) {
        try {
          const r = await runSyncForConnection(conn.id, "scheduled");
          logger.info({ connectionId: conn.id, ...r }, "Scheduled ad sync completed");
        } catch (err) {
          logger.error({ err, connectionId: conn.id }, "Scheduled ad sync failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "Ad sync scheduler tick failed");
    }
  }, { timezone: "Asia/Kolkata" });
  logger.info("Ad sync scheduler started (08/12/16/20 IST)");
}
