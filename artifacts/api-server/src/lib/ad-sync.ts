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

export interface AdCredentials {
  accessToken?: string; refreshToken?: string; expiresAt?: string;
  // Google Ads
  developerToken?: string; clientId?: string; clientSecret?: string; loginCustomerId?: string;
}

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

/* --------------------------- Google Ads client -------------------------- */

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v18";

/** Exchange the stored refresh token for a short-lived access token. */
async function googleAccessToken(creds: AdCredentials): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken ?? "",
      client_id: creds.clientId ?? "",
      client_secret: creds.clientSecret ?? "",
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error_description || body?.error || `Google OAuth error (HTTP ${res.status})`);
    (err as any).googleAuthError = body?.error; // "invalid_grant" = refresh token revoked/expired
    throw err;
  }
  return body.access_token as string;
}

async function googleAdsPost(path: string, accessToken: string, creds: AdCredentials, payload: unknown, loginCustomerId?: string): Promise<any> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${GOOGLE_ADS_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": creds.developerToken ?? "",
        "Content-Type": "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 429 && attempt < 3) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const detail = Array.isArray(body) ? body[0]?.error : body?.error;
    const err = new Error(detail?.message || `Google Ads API error (HTTP ${res.status})`);
    (err as any).googleStatus = res.status;
    throw err;
  }
}

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, "");

/**
 * Validate Google Ads credentials and list accessible (non-manager) customer
 * accounts. Used at connect time — nothing is stored if this fails.
 */
export async function googleListCustomers(creds: AdCredentials): Promise<{ externalId: string; name: string; currency: string }[]> {
  const accessToken = await googleAccessToken(creds);
  const res = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": creds.developerToken ?? "" },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Google Ads API error (HTTP ${res.status})`);
  const ids: string[] = (body.resourceNames ?? []).map((r: string) => r.split("/")[1]);

  const out: { externalId: string; name: string; currency: string }[] = [];
  for (const id of ids) {
    try {
      // login-customer-id identifies the MANAGER (MCC) account a request goes
      // through — it must be omitted for direct customer access.
      const login = creds.loginCustomerId ? digitsOnly(creds.loginCustomerId) : undefined;
      const data = await googleAdsPost(`/customers/${id}/googleAds:search`, accessToken, creds, {
        query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer",
      }, login);
      const c = data.results?.[0]?.customer;
      if (c && !c.manager) out.push({ externalId: id, name: c.descriptiveName || `Account ${id}`, currency: c.currencyCode || "" });
    } catch {
      // Skip accounts we can't read (e.g. cancelled or wrong login-customer-id).
    }
  }
  return out;
}

/** Sync one Google Ads connection: last N days of daily campaign metrics. */
async function runGoogleSync(connectionId: number, trigger: "scheduled" | "manual", days = 30): Promise<{ jobId: number; status: string; rows: number }> {
  const [conn] = await db.select().from(adConnectionsTable).where(eq(adConnectionsTable.id, connectionId));
  if (!conn) throw new Error("Connection not found");
  const [job] = await db.insert(syncJobsTable).values({
    connectionId, companyId: conn.companyId, platform: conn.platform, trigger, status: "running",
  }).returning();

  let rows = 0;
  let failedAccounts = 0;
  try {
    const creds = decryptCredentials(conn.credentialsEnc);
    let accessToken: string;
    try {
      accessToken = await googleAccessToken(creds);
    } catch (e: any) {
      if (e.googleAuthError === "invalid_grant") {
        await db.update(adConnectionsTable)
          .set({ status: "expired", lastError: "Google refresh token revoked or expired — reconnect Google Ads.", updatedAt: new Date() })
          .where(eq(adConnectionsTable.id, connectionId));
      }
      throw e;
    }

    const accounts = await db.select().from(adAccountsTable)
      .where(and(eq(adAccountsTable.connectionId, connectionId), eq(adAccountsTable.syncEnabled, true)));
    if (accounts.length === 0) await log(job.id, "warn", "No sync-enabled ad accounts on this connection");

    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 86400000);
    const dstr = (d: Date) => d.toISOString().slice(0, 10);
    const query = `
      SELECT segments.date, campaign.id, campaign.name,
             metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${dstr(since)}' AND '${dstr(until)}'`;

    for (const account of accounts) {
      try {
        const login = creds.loginCustomerId ? digitsOnly(creds.loginCustomerId) : undefined;
        let pageToken: string | undefined;
        do {
          const data = await googleAdsPost(`/customers/${account.externalId}/googleAds:search`, accessToken, creds, {
            query, pageSize: 1000, ...(pageToken ? { pageToken } : {}),
          }, login);
          for (const r of data.results ?? []) {
            const campaignId = await resolveLocalCampaign(
              conn.companyId, account.id, String(r.campaign.id), r.campaign.name, "google",
            );
            await upsertDaily({
              companyId: conn.companyId,
              campaignId,
              date: r.segments.date,
              source: "google",
              spend: (Number(r.metrics?.costMicros) || 0) / 1_000_000,
              revenue: Number(r.metrics?.conversionsValue) || 0,
              impressions: Number(r.metrics?.impressions) || 0,
              reach: 0, // Google Ads has no daily reach metric at campaign level
              clicks: Number(r.metrics?.clicks) || 0,
              leads: 0,
              conversions: Number(r.metrics?.conversions) || 0,
            });
            rows += 1;
          }
          pageToken = data.nextPageToken;
        } while (pageToken);
        await log(job.id, "info", `Synced customer ${account.externalId}`, { account: account.externalId });
      } catch (e: any) {
        failedAccounts += 1;
        await log(job.id, "error", `Customer ${account.externalId} failed: ${e.message}`, { httpStatus: e.googleStatus ?? null });
      }
    }

    await refreshChannelAggregates(conn.companyId, "google");

    const status = failedAccounts > 0 ? "partial" : "success";
    await db.update(syncJobsTable).set({ status, finishedAt: new Date(), rowsUpserted: rows }).where(eq(syncJobsTable.id, job.id));
    await db.update(adConnectionsTable)
      .set({ lastSyncedAt: new Date(), lastError: failedAccounts > 0 ? "Some accounts failed — see sync logs." : null, status: "connected", updatedAt: new Date() })
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

/** Refresh lifetime aggregates for all synced campaigns of a company+channel. */
async function refreshChannelAggregates(companyId: number, channel: string): Promise<void> {
  const synced = await db.select({ id: campaignsTable.id }).from(campaignsTable)
    .where(and(eq(campaignsTable.companyId, companyId), eq(campaignsTable.channel, channel)));
  for (const c of synced) {
    const [has] = await db.select({ id: campaignDailyMetricsTable.id }).from(campaignDailyMetricsTable)
      .where(eq(campaignDailyMetricsTable.campaignId, c.id)).limit(1);
    if (has) await refreshCampaignAggregates(c.id);
  }
}

/**
 * Find-or-create the local campaign for a synced platform campaign.
 * Identity is (companyId, channel, externalId): platform campaign IDs are
 * unique within a platform but could collide ACROSS platforms, and keying on
 * the local ad-account row would fragment campaigns on reconnect.
 */
async function resolveLocalCampaign(companyId: number, adAccountId: number, externalId: string, name: string, channel: string): Promise<number> {
  const [existing] = await db.select().from(campaignsTable)
    .where(and(eq(campaignsTable.companyId, companyId), eq(campaignsTable.channel, channel), eq(campaignsTable.externalId, externalId)));
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
    .where(and(eq(campaignsTable.companyId, companyId), eq(campaignsTable.channel, channel), eq(campaignsTable.externalId, externalId)));
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
    const metaToken = creds.accessToken ?? "";
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
          const data = await metaGet(`/${account.externalId}/insights`, metaToken, {
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

    await refreshChannelAggregates(conn.companyId, "meta");

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
  if (conn.platform === "google") return runGoogleSync(connectionId, trigger);
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
