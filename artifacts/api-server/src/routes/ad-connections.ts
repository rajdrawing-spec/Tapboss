import { Router } from "express";
import {
  db, adConnectionsTable, adAccountsTable, syncJobsTable, syncLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireSuperAdmin } from "../middleware/authz";
import { canAccessCompany } from "../lib/company-scope";
import {
  encryptCredentials, metaListAdAccounts, googleListCustomers, ga4ValidateProperty, runSyncForConnection,
} from "../lib/ad-sync";

/**
 * Ad-platform connections (Meta / Google Ads / GA4) — super-admin only.
 * Tokens are encrypted at rest and NEVER returned to the frontend.
 */
const router = Router();

router.use("/ad-connections", requireSuperAdmin);

const publicConnection = (c: typeof adConnectionsTable.$inferSelect) => ({
  id: c.id, companyId: c.companyId, platform: c.platform, status: c.status,
  accountLabel: c.accountLabel, lastSyncedAt: c.lastSyncedAt, lastError: c.lastError,
  createdAt: c.createdAt,
});

router.get("/ad-connections", async (req, res) => {
  try {
    const rows = await db.select().from(adConnectionsTable).orderBy(desc(adConnectionsTable.createdAt));
    const accounts = await db.select().from(adAccountsTable);
    res.json(rows.map((c) => ({
      ...publicConnection(c),
      accounts: accounts.filter((a) => a.connectionId === c.id).map((a) => ({
        id: a.id, externalId: a.externalId, name: a.name, currency: a.currency, syncEnabled: a.syncEnabled,
      })),
    })));
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to list connections" }); }
});

const connectMetaSchema = z.object({
  companyId: z.number().int(),
  accessToken: z.string().min(20),
  accountLabel: z.string().max(200).optional(),
});

/**
 * Connect Meta via a (long-lived) system-user or user access token from the
 * user's own Meta app. The token is validated by listing its ad accounts
 * before anything is stored.
 */
router.post("/ad-connections/meta", async (req, res) => {
  try {
    const parsed = connectMetaSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    if (!canAccessCompany(req, parsed.data.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    let accounts;
    try {
      accounts = await metaListAdAccounts(parsed.data.accessToken);
    } catch (e: any) {
      res.status(400).json({ error: `Meta rejected the token: ${e.message}` }); return;
    }
    if (accounts.length === 0) {
      res.status(400).json({ error: "This token has no ad accounts. Use a token with ads_read permission." }); return;
    }
    const user = (req as any).localUser;
    const [conn] = await db.insert(adConnectionsTable).values({
      companyId: parsed.data.companyId,
      platform: "meta",
      status: "connected",
      accountLabel: parsed.data.accountLabel ?? null,
      credentialsEnc: encryptCredentials({ accessToken: parsed.data.accessToken }),
      scopes: "ads_read",
      connectedByUserId: user?.id ?? null,
    }).returning();
    for (const a of accounts) {
      await db.insert(adAccountsTable).values({
        connectionId: conn.id, companyId: parsed.data.companyId, platform: "meta",
        externalId: a.externalId, name: a.name, currency: a.currency,
      }).onConflictDoNothing();
    }
    res.status(201).json(publicConnection(conn));
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to connect Meta" }); }
});

const connectGoogleSchema = z.object({
  companyId: z.number().int(),
  developerToken: z.string().min(10),
  clientId: z.string().min(10),
  clientSecret: z.string().min(10),
  refreshToken: z.string().min(10),
  loginCustomerId: z.string().max(20).optional(), // manager (MCC) account id, digits or 123-456-7890
  accountLabel: z.string().max(200).optional(),
});

/**
 * Connect Google Ads by pasting API credentials (developer token + OAuth
 * client + refresh token). Validated by listing accessible customer accounts
 * before anything is stored.
 */
router.post("/ad-connections/google", async (req, res) => {
  try {
    const parsed = connectGoogleSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    if (!canAccessCompany(req, parsed.data.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const { companyId, accountLabel, ...creds } = parsed.data;
    let accounts;
    try {
      accounts = await googleListCustomers(creds);
    } catch (e: any) {
      res.status(400).json({ error: `Google rejected the credentials: ${e.message}` }); return;
    }
    if (accounts.length === 0) {
      res.status(400).json({ error: "No readable Google Ads accounts found for these credentials. Check the refresh token's Google account and the login customer ID." }); return;
    }
    const user = (req as any).localUser;
    const [conn] = await db.insert(adConnectionsTable).values({
      companyId,
      platform: "google",
      status: "connected",
      accountLabel: accountLabel ?? null,
      credentialsEnc: encryptCredentials(creds),
      scopes: "adwords",
      connectedByUserId: user?.id ?? null,
    }).returning();
    for (const a of accounts) {
      await db.insert(adAccountsTable).values({
        connectionId: conn.id, companyId, platform: "google",
        externalId: a.externalId, name: a.name, currency: a.currency,
      }).onConflictDoNothing();
    }
    res.status(201).json(publicConnection(conn));
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to connect Google Ads" }); }
});

const connectGa4Schema = z.object({
  companyId: z.number().int(),
  serviceAccountJson: z.string().min(50),
  propertyId: z.string().min(4).max(20),
  accountLabel: z.string().max(200).optional(),
});

/**
 * Connect GA4 with a service account JSON (added as Viewer on the property)
 * plus the numeric property ID. Validated with a metadata call before storing.
 */
router.post("/ad-connections/ga4", async (req, res) => {
  try {
    const parsed = connectGa4Schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    if (!canAccessCompany(req, parsed.data.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    let property;
    try {
      property = await ga4ValidateProperty(parsed.data.serviceAccountJson, parsed.data.propertyId);
    } catch (e: any) {
      res.status(400).json({ error: `GA4 rejected the credentials: ${e.message}` }); return;
    }
    const user = (req as any).localUser;
    const [conn] = await db.insert(adConnectionsTable).values({
      companyId: parsed.data.companyId,
      platform: "ga4",
      status: "connected",
      accountLabel: parsed.data.accountLabel ?? null,
      credentialsEnc: encryptCredentials({ serviceAccountJson: parsed.data.serviceAccountJson }),
      scopes: "analytics.readonly",
      connectedByUserId: user?.id ?? null,
    }).returning();
    await db.insert(adAccountsTable).values({
      connectionId: conn.id, companyId: parsed.data.companyId, platform: "ga4",
      externalId: property.externalId, name: property.name, currency: null,
    }).onConflictDoNothing();
    res.status(201).json(publicConnection(conn));
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to connect GA4" }); }
});

router.patch("/ad-connections/:id/accounts/:accountId", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    const syncEnabled = Boolean((req.body ?? {}).syncEnabled);
    const [row] = await db.update(adAccountsTable).set({ syncEnabled, updatedAt: new Date() })
      .where(and(eq(adAccountsTable.id, accountId), eq(adAccountsTable.connectionId, id))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: row.id, syncEnabled: row.syncEnabled });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to update account" }); }
});

router.delete("/ad-connections/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.delete(adConnectionsTable).where(eq(adConnectionsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(adAccountsTable).where(eq(adAccountsTable.connectionId, id));
    res.json({ ok: true });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to disconnect" }); }
});

/** Sync Now. */
router.post("/ad-connections/:id/sync", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await runSyncForConnection(id, "manual");
    res.json(result);
  } catch (e: any) {
    req.log.error(e);
    res.status(502).json({ error: e.message || "Sync failed" });
  }
});

router.get("/ad-connections/:id/jobs", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const jobs = await db.select().from(syncJobsTable)
      .where(eq(syncJobsTable.connectionId, id))
      .orderBy(desc(syncJobsTable.startedAt)).limit(20);
    res.json(jobs);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to list sync jobs" }); }
});

router.get("/ad-connections/:id/jobs/:jobId/logs", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const jobId = parseInt(req.params.jobId);
    const [job] = await db.select().from(syncJobsTable)
      .where(and(eq(syncJobsTable.id, jobId), eq(syncJobsTable.connectionId, id)));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    const logs = await db.select().from(syncLogsTable)
      .where(eq(syncLogsTable.jobId, jobId)).orderBy(desc(syncLogsTable.createdAt)).limit(200);
    res.json(logs);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to list sync logs" }); }
});

export default router;
