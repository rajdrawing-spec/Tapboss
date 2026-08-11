/**
 * Shared marketing data helpers used by the internal marketing-reports routes
 * and the client portal (client-marketing). Everything here is scoped to a
 * single project/company — callers are responsible for authorization.
 */
import {
  db, campaignsTable, campaignLeadsTable, ordersTable, campaignDailyMetricsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";
import type { ClientVisibilitySettings } from "./client-visibility";

export interface DateRange { from: Date; to: Date; prevFrom: Date; prevTo: Date }

/** Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: last 30 days) and derive the equal-length previous period. */
export function parseRange(req: import("express").Request): DateRange | null {
  const q = req.query as Record<string, string>;
  const to = q.to ? new Date(`${q.to}T23:59:59.999`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00`) : new Date(to.getTime() - 29 * 86400000);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return null;
  const len = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - len - 1), prevTo: new Date(from.getTime() - 1) };
}

/** Local-time bucket key for a date (day | week | month). */
export function bucketKey(d: Date, group: string): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (group === "month") return `${y}-${pad(m)}`;
  if (group === "week") {
    const monday = new Date(d);
    monday.setDate(day - ((d.getDay() + 6) % 7));
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  }
  return `${y}-${pad(m)}-${pad(day)}`;
}

/** YYYY-MM-DD from local date components (never toISOString — TZ shifts the day). */
export function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const CANCELLED_STATUSES = ["cancelled", "returned", "refunded"];

/** Orders in a range for a company (client-safe aggregation source). */
export async function fetchOrders(companyId: number, from: Date, to: Date) {
  return db.select().from(ordersTable)
    .where(and(eq(ordersTable.companyId, companyId), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .orderBy(desc(ordersTable.createdAt));
}

/**
 * Order stats policy: "net" orders/revenue = every order that has not been
 * cancelled, returned or refunded.
 */
export function orderStats(orders: { status: string; totalAmount: number; itemCount: number }[]) {
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const returned = orders.filter((o) => o.status === "returned" || o.status === "refunded").length;
  const counted = orders.filter((o) => !CANCELLED_STATUSES.includes(o.status));
  const revenue = counted.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  return {
    totalOrders: orders.length,
    netOrders: counted.length,
    cancelledOrders: cancelled,
    returnedOrders: returned,
    revenue,
    aov: counted.length > 0 ? revenue / counted.length : 0,
  };
}

/** Client-visible campaigns of the project (KPI + list source). */
export async function fetchProjectCampaigns(projectId: number) {
  return db.select().from(campaignsTable)
    .where(and(eq(campaignsTable.projectId, projectId), eq(campaignsTable.clientVisible, true)))
    .orderBy(desc(campaignsTable.createdAt));
}

export function campaignTotals(rows: any[]) {
  const t = { spend: 0, revenue: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0 };
  for (const c of rows) {
    t.spend += Number(c.spent) || 0;
    t.revenue += Number(c.revenue) || 0;
    t.impressions += Number(c.impressions) || 0;
    t.clicks += Number(c.clicks) || 0;
    t.leads += Number(c.leads) || 0;
    t.conversions += Number(c.conversions) || 0;
  }
  return t;
}

export const pctChange = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;

/**
 * Daily metric rows (any source) for a set of campaigns within a date range.
 * Guards against empty campaign lists (drizzle inArray([]) is invalid).
 */
export async function fetchDailyMetrics(campaignIds: number[], from: Date, to: Date) {
  if (campaignIds.length === 0) return [];
  return db.select().from(campaignDailyMetricsTable).where(and(
    inArray(campaignDailyMetricsTable.campaignId, campaignIds),
    gte(campaignDailyMetricsTable.date, localDateKey(from)),
    lte(campaignDailyMetricsTable.date, localDateKey(to)),
  ));
}

export interface ReportProject { id: number; companyId: number; name: string; brandName: string | null }

/**
 * Build the client-safe report payload for a project + range, honoring the
 * project's visibility settings. Used by the live client /report endpoint and
 * by internal report generation (snapshot stored in marketing_reports).
 */
export async function buildReportPayload(project: ReportProject, vis: ClientVisibilitySettings, range: DateRange) {
  const [orders, prevOrders, campaigns, leadRows] = await Promise.all([
    fetchOrders(project.companyId, range.from, range.to),
    fetchOrders(project.companyId, range.prevFrom, range.prevTo),
    fetchProjectCampaigns(project.id),
    db.select().from(campaignLeadsTable).where(and(
      eq(campaignLeadsTable.projectId, project.id), eq(campaignLeadsTable.clientVisible, true),
      gte(campaignLeadsTable.createdAt, range.from), lte(campaignLeadsTable.createdAt, range.to),
    )),
  ]);

  const cur = orderStats(orders);
  const prev = orderStats(prevOrders);
  const ct = campaignTotals(campaigns);

  const ranked = campaigns
    .map((c) => {
      const spent = Number(c.spent) || 0, revenue = Number(c.revenue) || 0;
      return {
        id: c.id, name: c.name, channel: c.channel,
        ...(vis.adSpend ? { spend: spent } : {}),
        ...(vis.revenue ? { revenue } : {}),
        ...(vis.roas ? { roas: spent > 0 ? revenue / spent : null } : {}),
        _rank: spent > 0 ? revenue / spent : -1, _active: spent > 0 || revenue > 0,
      };
    })
    .filter((c) => c._active)
    .sort((a, b) => b._rank - a._rank)
    .map(({ _rank, _active, ...c }) => c);

  const kpis: Record<string, number | null> = {};
  if (vis.revenue) { kpis.revenue = cur.revenue; kpis.aov = cur.aov; }
  if (vis.orders) kpis.orders = cur.netOrders;
  if (vis.leads) kpis.leads = leadRows.length;

  const campaignLifetime: Record<string, number | null> = {};
  if (vis.adSpend) campaignLifetime.adSpend = ct.spend;
  if (vis.roas) campaignLifetime.roas = ct.spend > 0 ? ct.revenue / ct.spend : null;
  if (vis.campaigns) {
    campaignLifetime.impressions = ct.impressions;
    campaignLifetime.clicks = ct.clicks;
    campaignLifetime.ctr = ct.impressions > 0 ? (ct.clicks / ct.impressions) * 100 : null;
  }

  const comparison: Record<string, unknown> = {};
  if (vis.revenue) comparison.revenue = { current: cur.revenue, previous: prev.revenue, change: pctChange(cur.revenue, prev.revenue) };
  if (vis.orders) comparison.orders = { current: cur.netOrders, previous: prev.netOrders, change: pctChange(cur.netOrders, prev.netOrders) };

  return {
    project: { id: project.id, name: project.name, brandName: project.brandName ?? project.name },
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    kpis,
    campaignLifetime,
    campaignTable: vis.campaigns ? ranked : [],
    bestCampaign: vis.campaigns ? ranked[0] ?? null : null,
    worstCampaign: vis.campaigns && ranked.length > 1 ? ranked[ranked.length - 1] : null,
    comparison,
    generatedAt: new Date().toISOString(),
  };
}

export type ReportPayload = Awaited<ReturnType<typeof buildReportPayload>>;

/**
 * Re-apply the CURRENT visibility settings to a stored report snapshot.
 * A report is generated under the visibility rules of that moment, but if the
 * admin later hides a metric, previously approved reports must not keep
 * exposing it to the client.
 */
export function redactReportPayload(payload: ReportPayload, vis: ClientVisibilitySettings): ReportPayload {
  const kpis = { ...payload.kpis };
  if (!vis.revenue) { delete kpis.revenue; delete kpis.aov; }
  if (!vis.orders) delete kpis.orders;
  if (!vis.leads) delete kpis.leads;

  const campaignLifetime = { ...payload.campaignLifetime };
  if (!vis.adSpend) delete campaignLifetime.adSpend;
  if (!vis.roas) delete campaignLifetime.roas;
  if (!vis.campaigns) { delete campaignLifetime.impressions; delete campaignLifetime.clicks; delete campaignLifetime.ctr; }

  const comparison = { ...payload.comparison } as Record<string, unknown>;
  if (!vis.revenue) delete comparison.revenue;
  if (!vis.orders) delete comparison.orders;

  const redactCampaign = <T extends Record<string, unknown> | null>(c: T): T => {
    if (!c) return c;
    const copy: Record<string, unknown> = { ...c };
    if (!vis.adSpend) delete copy.spend;
    if (!vis.revenue) delete copy.revenue;
    if (!vis.roas) delete copy.roas;
    return copy as T;
  };

  return {
    ...payload,
    kpis,
    campaignLifetime,
    comparison,
    campaignTable: vis.campaigns ? (payload.campaignTable ?? []).map((c) => redactCampaign(c)) : [],
    bestCampaign: vis.campaigns ? redactCampaign(payload.bestCampaign) : null,
    worstCampaign: vis.campaigns ? redactCampaign(payload.worstCampaign) : null,
  };
}
