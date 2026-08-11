import { describe, it, expect } from "vitest";
import { redactReportPayload, type ReportPayload } from "./marketing-data";

const vis = (over: Partial<Record<string, boolean>>) => ({
  revenue: true, orders: true, adSpend: true, roas: true, leads: true,
  cpa: true, conversion: true, campaigns: true, creatives: true,
  reports: true, ai: true, aiRequiresReview: false, ...over,
}) as any;

const payload: ReportPayload = {
  project: { id: 1, name: "P", brandName: "P" },
  range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" },
  kpis: { revenue: 1000, aov: 100, orders: 10, leads: 5 },
  campaignLifetime: { adSpend: 200, roas: 5, impressions: 999, clicks: 50, ctr: 5 },
  campaignTable: [{ id: 1, name: "C", channel: "meta", spend: 200, revenue: 1000, roas: 5 }] as any,
  bestCampaign: { id: 1, name: "C", channel: "meta", spend: 200, revenue: 1000, roas: 5 } as any,
  worstCampaign: null,
  comparison: { revenue: { current: 1, previous: 1, change: 0 }, orders: { current: 1, previous: 1, change: 0 } } as any,
  generatedAt: "2026-08-01T00:00:00.000Z",
};

describe("redactReportPayload — visibility changed AFTER report approval", () => {
  it("strips revenue everywhere when revenue is later hidden", () => {
    const r = redactReportPayload(payload, vis({ revenue: false }));
    expect(r.kpis.revenue).toBeUndefined();
    expect(r.kpis.aov).toBeUndefined();
    expect((r.comparison as any).revenue).toBeUndefined();
    expect((r.campaignTable[0] as any).revenue).toBeUndefined();
    expect((r.bestCampaign as any).revenue).toBeUndefined();
    // untouched metrics survive
    expect(r.kpis.orders).toBe(10);
    expect(r.campaignLifetime.adSpend).toBe(200);
  });

  it("strips spend/roas when hidden", () => {
    const r = redactReportPayload(payload, vis({ adSpend: false, roas: false }));
    expect(r.campaignLifetime.adSpend).toBeUndefined();
    expect(r.campaignLifetime.roas).toBeUndefined();
    expect((r.campaignTable[0] as any).spend).toBeUndefined();
    expect((r.campaignTable[0] as any).roas).toBeUndefined();
  });

  it("removes the whole campaign section when campaigns are hidden", () => {
    const r = redactReportPayload(payload, vis({ campaigns: false }));
    expect(r.campaignTable).toEqual([]);
    expect(r.bestCampaign).toBeNull();
    expect(r.campaignLifetime.impressions).toBeUndefined();
  });

  it("returns the payload unchanged when everything is visible", () => {
    const r = redactReportPayload(payload, vis({}));
    expect(r.kpis).toEqual(payload.kpis);
    expect(r.campaignTable).toEqual(payload.campaignTable);
  });
});
