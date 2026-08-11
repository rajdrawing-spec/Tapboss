import { Router } from "express";
import type { User } from "@workspace/db";
import {
  db, marketingProjectsTable, marketingProjectMembersTable,
  campaignsTable, campaignCreativesTable, campaignLeadsTable,
  clientAiPlansTable, marketingReportsTable, siteDailyMetricsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, gte, lte } from "drizzle-orm";
import { requirePermission } from "../middleware/authz";
import { projectScope, requireProjectAccess } from "../lib/project-scope";
import { getClientVisibility, logClientEvent, type ClientVisibilitySettings } from "../lib/client-visibility";
import { getActiveProvider, getActiveProviderName } from "../lib/ai-provider";
import {
  parseRange, bucketKey, CANCELLED_STATUSES, fetchOrders, orderStats,
  fetchProjectCampaigns, campaignTotals, pctChange, fetchDailyMetrics,
  buildReportPayload, redactReportPayload,
} from "../lib/marketing-data";
import { renderReportPdf } from "../lib/report-pdf";

/**
 * Client Marketing Portal API — the ONLY API surface reachable by client-role
 * users (enforced globally by blockClientUsersFromInternalApi). Everything is
 * scoped to the caller's project memberships; no companyId trust anywhere.
 */
const router = Router();

router.use("/client/marketing", requirePermission("client_portal.view"));

/** Portal context: the caller's assigned projects with brand identity. */
router.get("/client/marketing/context", async (req, res) => {
  try {
    const scope = await projectScope(req);
    let projects: (typeof marketingProjectsTable.$inferSelect)[];
    if (scope === null) {
      projects = await db.select().from(marketingProjectsTable).orderBy(desc(marketingProjectsTable.createdAt));
    } else if (scope.length === 0) {
      projects = [];
    } else {
      projects = await db.select().from(marketingProjectsTable)
        .where(inArray(marketingProjectsTable.id, scope))
        .orderBy(desc(marketingProjectsTable.createdAt));
    }
    const u = (req as any).localUser as User;
    // Only expose active projects to clients.
    const visible = projects.filter((p) => p.status === "active");
    const memberRows = visible.length
      ? await db.select().from(marketingProjectMembersTable)
          .where(and(
            eq(marketingProjectMembersTable.userId, u.id),
            inArray(marketingProjectMembersTable.projectId, visible.map((p) => p.id)),
          ))
      : [];
    const memberTypeByProject = new Map(memberRows.map((m) => [m.projectId, m.memberType]));
    res.json({
      user: { id: u.id, name: u.name, email: u.email, role: u.role, avatarUrl: u.avatarUrl },
      projects: visible.map((p) => ({
        id: p.id,
        name: p.name,
        brandName: p.brandName ?? p.name,
        brandColor: p.brandColor,
        logoUrl: p.logoUrl,
        status: p.status,
        memberType: memberTypeByProject.get(p.id) ?? "internal",
      })),
    });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load portal context" }); }
});

// ---- Project-scoped, client-visible marketing data --------------------------
// Every route below resolves :projectId through requireProjectAccess (member
// or super admin only) and filters records by BOTH projectId AND
// clientVisible=true. Records are linked/exposed exclusively via the
// super-admin linking endpoint, so nothing internal can leak here.
// Orders have no projectId; they are scoped to the project's company (one
// brand per company) and reduced to client-safe fields only.

/* ------------------------------ helpers ------------------------------ */
// Data helpers (parseRange, orderStats, campaignTotals, …) live in
// ../lib/marketing-data and are shared with internal report generation.

function parsePagination(req: import("express").Request): { page: number; pageSize: number } {
  const q = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(q.page || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || "20") || 20));
  return { page, pageSize };
}

/* ------------------------------ visibility ------------------------------ */

/**
 * Per-project client visibility settings, controlled by the super admin.
 * Client endpoints below enforce every toggle server-side: hidden sections
 * return 403 and hidden KPIs are removed from responses (never just hidden
 * in the UI).
 */
router.get("/client/marketing/projects/:projectId/visibility", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const v = await getClientVisibility(project.id);
    // aiRequiresReview is an internal workflow flag — not the client's business.
    const { aiRequiresReview: _internal, ...publicSettings } = v;
    res.json(publicSettings);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load visibility settings" }); }
});

/* ------------------------------ overview ------------------------------ */

router.get("/client/marketing/projects/:projectId/overview", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    const range = parseRange(req);
    if (!range) { res.status(400).json({ error: "Invalid date range" }); return; }
    const group = ["day", "week", "month"].includes(String(req.query.group)) ? String(req.query.group) : "day";

    const [orders, prevOrders, campaigns, leadRows, prevLeadRows] = await Promise.all([
      fetchOrders(project.companyId, range.from, range.to),
      fetchOrders(project.companyId, range.prevFrom, range.prevTo),
      fetchProjectCampaigns(project.id),
      // (leads current + previous below)
      db.select().from(campaignLeadsTable).where(and(
        eq(campaignLeadsTable.projectId, project.id), eq(campaignLeadsTable.clientVisible, true),
        gte(campaignLeadsTable.createdAt, range.from), lte(campaignLeadsTable.createdAt, range.to),
      )),
      db.select().from(campaignLeadsTable).where(and(
        eq(campaignLeadsTable.projectId, project.id), eq(campaignLeadsTable.clientVisible, true),
        gte(campaignLeadsTable.createdAt, range.prevFrom), lte(campaignLeadsTable.createdAt, range.prevTo),
      )),
    ]);

    const cur = orderStats(orders);
    const prev = orderStats(prevOrders);
    const ct = campaignTotals(campaigns);
    const leads = leadRows.length;
    const prevLeads = prevLeadRows.length;
    const convertedLeads = leadRows.filter((l: any) => l.status === "converted").length;

    // Daily platform metrics (synced from Meta/Google or manual) power the
    // spend/conversions trend lines when available.
    const dailyRows = await fetchDailyMetrics(campaigns.map((c) => c.id), range.from, range.to);

    // GA4 website analytics (site-wide, not ad-attributed) — separate table.
    const dstr = (d: Date) => d.toISOString().slice(0, 10);
    const siteRows = vis.analytics
      ? await db.select().from(siteDailyMetricsTable).where(and(
          eq(siteDailyMetricsTable.companyId, project.companyId),
          gte(siteDailyMetricsTable.date, dstr(range.from)),
          lte(siteDailyMetricsTable.date, dstr(range.to)),
        ))
      : [];

    // Timeseries: orders revenue/count + leads + daily spend/conversions per bucket.
    // adRevenue is the platform-attributed revenue from daily metrics — ROAS is
    // computed ONLY from aligned daily spend + daily ad revenue (mixing in
    // whole-company order revenue would overstate it).
    type Bucket = { period: string; revenue: number; orders: number; leads: number; spend: number; conversions: number; adRevenue: number; sessions: number; users: number };
    const buckets = new Map<string, Bucket>();
    const bump = (key: string, patch: Partial<Omit<Bucket, "period">>) => {
      const b = buckets.get(key) ?? { period: key, revenue: 0, orders: 0, leads: 0, spend: 0, conversions: 0, adRevenue: 0, sessions: 0, users: 0 };
      b.revenue += patch.revenue ?? 0; b.orders += patch.orders ?? 0; b.leads += patch.leads ?? 0;
      b.spend += patch.spend ?? 0; b.conversions += patch.conversions ?? 0; b.adRevenue += patch.adRevenue ?? 0;
      b.sessions += patch.sessions ?? 0; b.users += patch.users ?? 0;
      buckets.set(key, b);
    };
    for (const o of orders) {
      if (CANCELLED_STATUSES.includes(o.status)) continue;
      bump(bucketKey(new Date(o.createdAt), group), { revenue: Number(o.totalAmount) || 0, orders: 1 });
    }
    for (const l of leadRows) bump(bucketKey(new Date((l as any).createdAt), group), { leads: 1 });
    for (const m of dailyRows) {
      bump(bucketKey(new Date(`${m.date}T12:00:00`), group), {
        spend: Number(m.spend) || 0,
        conversions: Number(m.conversions) || 0,
        adRevenue: Number(m.revenue) || 0,
      });
    }
    for (const s of siteRows) {
      bump(bucketKey(new Date(`${s.date}T12:00:00`), group), { sessions: Number(s.sessions) || 0, users: Number(s.users) || 0 });
    }
    const hasDailySpend = dailyRows.some((m) => Number(m.spend) > 0);
    const hasDailyConversions = dailyRows.some((m) => Number(m.conversions) > 0);
    const hasSiteData = siteRows.length > 0;

    // Enforce visibility toggles server-side: hidden KPIs are REMOVED from
    // the payload, not merely hidden in the UI.
    const kpis: Record<string, number | null> = {};
    if (vis.revenue) { kpis.revenue = cur.revenue; kpis.aov = cur.aov; }
    if (vis.orders) kpis.orders = cur.netOrders;
    if (vis.leads) kpis.leads = leads;
    if (vis.conversion) kpis.conversionRate = leads > 0 ? (convertedLeads / leads) * 100 : null;

    // Campaign metrics are LIFETIME totals — campaigns only store running
    // aggregates (no dated snapshots), so these are deliberately reported
    // in a separate block and labeled "lifetime" in the UI. CPL/CPA use the
    // campaigns' own lifetime lead/conversion counters for consistency.
    const campaignLifetime: Record<string, number | null> = {};
    if (vis.adSpend) campaignLifetime.adSpend = ct.spend;
    if (vis.roas) campaignLifetime.roas = ct.spend > 0 ? ct.revenue / ct.spend : null;
    if (vis.adSpend && vis.leads) campaignLifetime.cpl = ct.leads > 0 && ct.spend > 0 ? ct.spend / ct.leads : null;
    if (vis.cpa) campaignLifetime.cpa = ct.conversions > 0 && ct.spend > 0 ? ct.spend / ct.conversions : null;

    const comparison: Record<string, number | null> = {};
    if (vis.revenue) comparison.revenue = pctChange(cur.revenue, prev.revenue);
    if (vis.orders) comparison.orders = pctChange(cur.netOrders, prev.netOrders);
    if (vis.leads) comparison.leads = pctChange(leads, prevLeads);

    logClientEvent(req, project.id, "portal.overview_viewed", { from: range.from.toISOString(), to: range.to.toISOString() });

    res.json({
      range: { from: range.from.toISOString(), to: range.to.toISOString(), group },
      kpis,
      campaignLifetime,
      comparison,
      timeseries: Array.from(buckets.values())
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((b) => ({
          period: b.period,
          ...(vis.revenue ? { revenue: b.revenue } : {}),
          ...(vis.orders ? { orders: b.orders } : {}),
          ...(vis.leads ? { leads: b.leads } : {}),
          ...(vis.adSpend && hasDailySpend ? { spend: b.spend } : {}),
          ...(vis.roas && hasDailySpend ? { roas: b.spend > 0 ? b.adRevenue / b.spend : null } : {}),
          ...(vis.conversion && hasDailyConversions ? { conversions: b.conversions } : {}),
          ...(vis.analytics && hasSiteData ? { sessions: b.sessions, users: b.users } : {}),
        })),
    });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load overview" }); }
});

/* ------------------------------ sales ------------------------------ */

router.get("/client/marketing/projects/:projectId/sales", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.orders) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const range = parseRange(req);
    if (!range) { res.status(400).json({ error: "Invalid date range" }); return; }
    const { page, pageSize } = parsePagination(req);

    const orders = await fetchOrders(project.companyId, range.from, range.to);
    const stats = orderStats(orders);
    const start = (page - 1) * pageSize;
    res.json({
      stats,
      orders: orders.slice(start, start + pageSize).map((o) => ({
        // Client-safe subset ONLY — no customer contact info, costs or notes.
        id: o.id,
        orderNumber: o.orderNumber,
        date: o.createdAt,
        itemCount: o.itemCount,
        totalAmount: o.totalAmount,
        status: o.status,
        channel: o.channel,
      })),
      pagination: { page, pageSize, total: orders.length, totalPages: Math.max(1, Math.ceil(orders.length / pageSize)) },
    });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load sales" }); }
});

/* ------------------------------ campaigns ------------------------------ */

router.get("/client/marketing/projects/:projectId/campaigns", requireProjectAccess(), async (req, res) => {
  try {
    const projectId = (req as any).project.id as number;
    const vis = await getClientVisibility(projectId);
    if (!vis.campaigns) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const { page, pageSize } = parsePagination(req);
    const rows = await fetchProjectCampaigns(projectId);
    const start = (page - 1) * pageSize;
    res.json({
      campaigns: rows.slice(start, start + pageSize).map((c) => {
        const spent = Number(c.spent) || 0, revenue = Number(c.revenue) || 0;
        const impressions = Number(c.impressions) || 0, clicks = Number(c.clicks) || 0;
        // Per-row financial fields honor the same visibility toggles as the KPIs.
        return {
          id: c.id, name: c.name, channel: c.channel, status: c.status,
          startDate: c.startDate, endDate: c.endDate,
          impressions, clicks,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
          leads: Number(c.leads) || 0, conversions: Number(c.conversions) || 0,
          ...(vis.adSpend ? { spend: spent } : {}),
          ...(vis.revenue ? { revenue } : {}),
          ...(vis.roas ? { roas: spent > 0 ? revenue / spent : null } : {}),
        };
      }),
      pagination: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
    });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load campaigns" }); }
});

/* ------------------------------ creatives ------------------------------ */

const CLIENT_CREATIVE_STATUSES = ["approved", "live"];

router.get("/client/marketing/projects/:projectId/creatives", requireProjectAccess(), async (req, res) => {
  try {
    const projectId = (req as any).project.id as number;
    const vis = await getClientVisibility(projectId);
    if (!vis.creatives) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const { page, pageSize } = parsePagination(req);
    const rows = await db.select().from(campaignCreativesTable)
      .where(and(
        eq(campaignCreativesTable.projectId, projectId),
        eq(campaignCreativesTable.clientVisible, true),
        inArray(campaignCreativesTable.status, CLIENT_CREATIVE_STATUSES),
      ))
      .orderBy(desc(campaignCreativesTable.createdAt));
    const start = (page - 1) * pageSize;
    res.json({
      creatives: rows.slice(start, start + pageSize).map((c) => ({
        id: c.id, name: c.name, type: c.type, format: c.format,
        url: c.url, thumbnailUrl: c.thumbnailUrl, status: c.status, createdAt: c.createdAt,
      })),
      pagination: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
    });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load creatives" }); }
});

/* ------------------------------ leads ------------------------------ */

/**
 * Serve a creative's asset to an authorized client. Client-role users are
 * blocked from the internal /storage routes, so this is the ONLY delivery
 * path for them: it re-checks project membership (requireProjectAccess),
 * client visibility, and creative status before streaming from storage.
 */
router.get("/client/marketing/projects/:projectId/creatives/:creativeId/asset", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const creativeId = parseInt(String(req.params.creativeId));
    if (!Number.isFinite(creativeId)) { res.status(400).json({ error: "Invalid creative id" }); return; }
    const vis = await getClientVisibility(project.id);
    if (!vis.creatives) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const [creative] = await db.select().from(campaignCreativesTable).where(and(
      eq(campaignCreativesTable.id, creativeId),
      eq(campaignCreativesTable.projectId, project.id),
      eq(campaignCreativesTable.clientVisible, true),
      inArray(campaignCreativesTable.status, CLIENT_CREATIVE_STATUSES),
    ));
    if (!creative) { res.status(404).json({ error: "Not found" }); return; }
    const wantThumb = req.query.thumb === "1";
    const url = wantThumb ? (creative.thumbnailUrl || creative.url) : creative.url;
    if (!url) { res.status(404).json({ error: "No asset for this creative" }); return; }
    if (!wantThumb && req.query.download === "1") {
      logClientEvent(req, project.id, "portal.creative_downloaded", { creativeId, name: creative.name });
    }
    if (!url.startsWith("/objects/")) {
      // External asset (e.g. https URL) — redirect, nothing to stream.
      res.redirect(url); return;
    }
    const { ObjectStorageService, ObjectNotFoundError } = await import("../lib/objectStorage");
    const svc = new ObjectStorageService();
    try {
      const file = await svc.getObjectEntityFile(url);
      const response = await svc.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
      if (response.body) {
        const { Readable } = await import("stream");
        Readable.fromWeb(response.body as any).pipe(res);
      } else { res.end(); }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Asset not found" }); return; }
      throw err;
    }
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to serve creative" }); }
});

// Client confirms a creative download so it can be audited.
router.post("/client/marketing/projects/:projectId/creatives/:creativeId/downloaded", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const creativeId = parseInt(String(req.params.creativeId));
    if (!Number.isFinite(creativeId)) { res.status(400).json({ error: "Invalid creative id" }); return; }
    const [creative] = await db.select().from(campaignCreativesTable).where(and(
      eq(campaignCreativesTable.id, creativeId),
      eq(campaignCreativesTable.projectId, project.id),
      eq(campaignCreativesTable.clientVisible, true),
    ));
    if (!creative) { res.status(404).json({ error: "Not found" }); return; }
    logClientEvent(req, project.id, "portal.creative_downloaded", { creativeId, name: creative.name });
    res.json({ ok: true });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to record download" }); }
});

router.get("/client/marketing/projects/:projectId/leads", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.leads) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const { page, pageSize } = parsePagination(req);
    const rows = await db.select().from(campaignLeadsTable)
      .where(and(eq(campaignLeadsTable.projectId, project.id), eq(campaignLeadsTable.clientVisible, true)))
      .orderBy(desc(campaignLeadsTable.createdAt));
    const campaignIds = Array.from(new Set(rows.map((l) => l.campaignId).filter((v): v is number => v != null)));
    // Resolve names ONLY from this project's client-visible campaigns — a lead
    // may reference a hidden or cross-project campaign whose name must not leak.
    const campaignRows = campaignIds.length
      ? await db.select().from(campaignsTable).where(and(
          inArray(campaignsTable.id, campaignIds),
          eq(campaignsTable.projectId, project.id),
          eq(campaignsTable.clientVisible, true),
        ))
      : [];
    const campaignName = new Map(campaignRows.map((c) => [c.id, c.name]));
    const start = (page - 1) * pageSize;
    res.json({
      leads: rows.slice(start, start + pageSize).map((l) => ({
        // Contact details (email/phone) and internal notes are never exposed.
        id: l.id, name: l.name, source: l.source, status: l.status,
        value: l.value, createdAt: l.createdAt,
        campaign: l.campaignId != null ? campaignName.get(l.campaignId) ?? null : null,
      })),
      pagination: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
    });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load leads" }); }
});

/* ------------------------------ reports ------------------------------ */

router.get("/client/marketing/projects/:projectId/report", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.reports) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const range = parseRange(req);
    if (!range) { res.status(400).json({ error: "Invalid date range" }); return; }

    const payload = await buildReportPayload(project, vis, range);
    logClientEvent(req, project.id, "portal.report_viewed", { from: range.from.toISOString(), to: range.to.toISOString() });
    res.json(payload);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to build report" }); }
});

/** Approved (published) PDF reports for the client. */
router.get("/client/marketing/projects/:projectId/reports", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.reports) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const rows = await db.select().from(marketingReportsTable)
      .where(and(eq(marketingReportsTable.projectId, project.id), eq(marketingReportsTable.status, "approved")))
      .orderBy(desc(marketingReportsTable.createdAt))
      .limit(50);
    res.json(rows.map((r) => ({
      id: r.id, type: r.type, title: r.title,
      periodFrom: r.periodFrom, periodTo: r.periodTo,
      approvedAt: r.approvedAt, createdAt: r.createdAt,
    })));
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to list reports" }); }
});

/** Download an approved report as PDF (rendered from the stored snapshot). */
router.get("/client/marketing/projects/:projectId/reports/:reportId/pdf", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.reports) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const reportId = parseInt(String(req.params.reportId));
    if (!Number.isFinite(reportId)) { res.status(400).json({ error: "Invalid report id" }); return; }
    const [report] = await db.select().from(marketingReportsTable).where(and(
      eq(marketingReportsTable.id, reportId),
      eq(marketingReportsTable.projectId, project.id),
      eq(marketingReportsTable.status, "approved"),
    ));
    if (!report || !report.payload) { res.status(404).json({ error: "Report not found" }); return; }
    logClientEvent(req, project.id, "portal.report_downloaded", { reportId, title: report.title });
    // Re-apply CURRENT visibility — metrics hidden after approval must not
    // keep leaking through previously generated snapshots.
    const safePayload = redactReportPayload(report.payload as any, vis);
    const pdf = await renderReportPdf(report.title, report.type, safePayload);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.title.replace(/[^a-z0-9-_ ]/gi, "")}.pdf"`);
    res.send(pdf);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to download report" }); }
});

/* ------------------------------ AI copilot ------------------------------ */

const AI_PLAN_SYSTEM_PROMPT = `You are an expert marketing strategist producing a client-facing analysis for ONE brand.
You are given ONLY that brand's marketing data. Use nothing else. Do not invent numbers.
Return ONLY valid JSON — no markdown, no text outside the JSON — with this exact schema:
{
  "observed": {                          // ONLY facts directly present in the data
    "working":         string[],        // 2-4 things performing well, each citing a number from the data
    "underperforming": string[]         // 2-4 things underperforming, each citing a number from the data
  },
  "likely_reasons":    string[],        // 2-4 hypotheses — clearly speculative, start each with "Likely" or "Possibly"
  "recommendations": {
    "campaigns": string[],              // 2-3 campaign attention/budget-shift recommendations
    "creatives": string[],              // 2-3 creative recommendations
    "budget":    string[],              // 1-3 budget recommendations
    "lead_gen":  string[]               // 1-3 lead generation recommendations
  },
  "plan_7_day":  [ { "day": string, "focus": string, "actions": string[] } ],   // 5-7 entries
  "plan_30_day": [ { "week": string, "focus": string, "actions": string[] } ],  // 4 entries (Week 1..4)
  "summary": string                     // 2-3 sentence executive summary
}
Keep every bullet under 20 words. Be specific and reference the data.`;

/**
 * Build the AI context STRICTLY from the authorized project's client-visible
 * data. Never includes other projects, other clients' names, internal costs,
 * margins, notes, or employee information.
 */
async function buildClientAiContext(project: { id: number; companyId: number; name: string; brandName: string | null }, vis: ClientVisibilitySettings): Promise<string> {
  const now = new Date();
  const from = new Date(now.getTime() - 29 * 86400000);
  const prevFrom = new Date(from.getTime() - 30 * 86400000);
  const [campaigns, orders, prevOrders, leadRows] = await Promise.all([
    fetchProjectCampaigns(project.id),
    fetchOrders(project.companyId, from, now),
    fetchOrders(project.companyId, prevFrom, new Date(from.getTime() - 1)),
    db.select().from(campaignLeadsTable).where(and(
      eq(campaignLeadsTable.projectId, project.id), eq(campaignLeadsTable.clientVisible, true),
      gte(campaignLeadsTable.createdAt, from), lte(campaignLeadsTable.createdAt, now),
    )),
  ]);
  const cur = orderStats(orders);
  const prev = orderStats(prevOrders);
  const lines: string[] = [
    `Brand: ${project.brandName ?? project.name}`,
    `Period: last 30 days (vs the 30 days before).`,
  ];
  if (vis.revenue) lines.push(`Net revenue: ₹${Math.round(cur.revenue)} (previous period ₹${Math.round(prev.revenue)}). Avg order value ₹${Math.round(cur.aov)}.`);
  if (vis.orders) lines.push(`Net orders: ${cur.netOrders} (previous ${prev.netOrders}); cancelled ${cur.cancelledOrders}, returned/refunded ${cur.returnedOrders}.`);
  if (vis.leads) {
    const converted = leadRows.filter((l: any) => l.status === "converted").length;
    lines.push(`Leads (30d): ${leadRows.length}, converted ${converted}. Sources: ${summarizeCounts(leadRows.map((l: any) => l.source || "unknown"))}.`);
  }
  if (vis.campaigns) {
    lines.push(`Campaigns (lifetime totals, client-visible only):`);
    for (const c of campaigns.slice(0, 20)) {
      const spent = Number(c.spent) || 0, revenue = Number(c.revenue) || 0;
      const parts = [`- "${c.name}" [${c.channel ?? "n/a"}, ${c.status}]`];
      if (vis.adSpend) parts.push(`spend ₹${Math.round(spent)}`);
      parts.push(`impressions ${Number(c.impressions) || 0}, clicks ${Number(c.clicks) || 0}, leads ${Number(c.leads) || 0}, conversions ${Number(c.conversions) || 0}`);
      if (vis.roas) parts.push(`revenue ₹${Math.round(revenue)}${spent > 0 ? `, ROAS ${(revenue / spent).toFixed(2)}x` : ""}`);
      lines.push(parts.join(", "));
    }
    if (campaigns.length === 0) lines.push("- (no campaigns shared yet)");
  }
  return lines.join("\n");
}

function summarizeCounts(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => `${k} ${n}`).join(", ") || "none";
}

const CLIENT_PLAN_FIELDS = {
  id: clientAiPlansTable.id,
  status: clientAiPlansTable.status,
  insights: clientAiPlansTable.insights,
  plan7: clientAiPlansTable.plan7,
  plan30: clientAiPlansTable.plan30,
  summary: clientAiPlansTable.summary,
  createdAt: clientAiPlansTable.createdAt,
  updatedAt: clientAiPlansTable.updatedAt,
};

/** Latest AI plan visible to the client (published), plus pending state. */
router.get("/client/marketing/projects/:projectId/ai-plan", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.ai) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }
    const rows = await db.select(CLIENT_PLAN_FIELDS).from(clientAiPlansTable)
      .where(eq(clientAiPlansTable.projectId, project.id))
      .orderBy(desc(clientAiPlansTable.createdAt));
    const published = rows.find((r) => r.status === "published") ?? null;
    const pending = rows.some((r) => r.status === "pending_review");
    res.json({ plan: published, pendingReview: pending });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load AI plan" }); }
});

/** Generate a fresh AI marketing plan from the project's own data. */
router.post("/client/marketing/projects/:projectId/ai-plan/generate", requireProjectAccess(), async (req, res) => {
  try {
    const project = (req as any).project;
    const vis = await getClientVisibility(project.id);
    if (!vis.ai) { res.status(403).json({ error: "This section is not enabled for your portal" }); return; }

    const contextText = await buildClientAiContext(project, vis);
    const provider = await getActiveProvider();
    const providerName = await getActiveProviderName();
    const raw = await provider.chat(
      [{ role: "user", content: `Analyse this brand's marketing data and produce the plan:\n\n${contextText}` }],
      AI_PLAN_SYSTEM_PROMPT,
    );
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(jsonStr); } catch {
      req.log.warn({ raw }, "Client AI plan returned non-JSON");
      res.status(502).json({ error: "AI returned unexpected format. Please retry." });
      return;
    }

    const user = (req as any).localUser;
    const needsReview = vis.aiRequiresReview === true;
    const status = needsReview ? "pending_review" : "published";
    // Archive older published plans so the client always sees exactly one.
    if (!needsReview) {
      await db.update(clientAiPlansTable)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(clientAiPlansTable.projectId, project.id), eq(clientAiPlansTable.status, "published")));
    }
    const [plan] = await db.insert(clientAiPlansTable).values({
      projectId: project.id,
      status,
      provider: providerName,
      insights: {
        observed: parsed.observed ?? { working: [], underperforming: [] },
        likelyReasons: Array.isArray(parsed.likely_reasons) ? parsed.likely_reasons : [],
        recommendations: parsed.recommendations ?? {},
      },
      plan7: Array.isArray(parsed.plan_7_day) ? parsed.plan_7_day : [],
      plan30: Array.isArray(parsed.plan_30_day) ? parsed.plan_30_day : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      requestedByUserId: user?.id ?? null,
    }).returning();

    logClientEvent(req, project.id, "portal.ai_plan_generated", { planId: plan.id, status });
    res.status(201).json(needsReview
      ? { pendingReview: true, plan: null }
      : { pendingReview: false, plan: { id: plan.id, status: plan.status, insights: plan.insights, plan7: plan.plan7, plan30: plan.plan30, summary: plan.summary, createdAt: plan.createdAt, updatedAt: plan.updatedAt } });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "AI plan generation failed" }); }
});

export default router;
