/**
 * Renders a marketing report payload (see buildReportPayload) into a PDF
 * buffer using pdfkit. Pure function of the stored snapshot — safe to call
 * for approved client downloads long after generation.
 */
import PDFDocument from "pdfkit";
import type { ReportPayload } from "./marketing-data";

const BLUE = "#1d90e8";
const DARK = "#111827";
const GRAY = "#6b7280";

const inr = (n: number | null | undefined) =>
  n == null ? "—" : `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("en-IN");
const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export function renderReportPdf(title: string, type: string, payload: ReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const from = new Date(payload.range.from);
    const to = new Date(payload.range.to);
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    // Header band
    doc.rect(0, 0, doc.page.width, 96).fill(DARK);
    doc.fill("#ffffff").fontSize(20).font("Helvetica-Bold")
      .text(payload.project.brandName, 48, 28);
    doc.fontSize(11).font("Helvetica").fill("#9ca3af")
      .text(`${title}  ·  ${fmt(from)} — ${fmt(to)}`, 48, 58);
    doc.fill(BLUE).fontSize(9).text(type.toUpperCase(), 48, 76);

    let y = 120;

    // KPI cards
    const kpiDefs: [string, string][] = [];
    if (payload.kpis.revenue != null) kpiDefs.push(["Net Revenue", inr(payload.kpis.revenue)]);
    if (payload.kpis.orders != null) kpiDefs.push(["Net Orders", num(payload.kpis.orders)]);
    if (payload.kpis.aov != null) kpiDefs.push(["Avg Order Value", inr(payload.kpis.aov)]);
    if (payload.kpis.leads != null) kpiDefs.push(["Leads", num(payload.kpis.leads)]);
    if (payload.campaignLifetime.adSpend != null) kpiDefs.push(["Ad Spend (lifetime)", inr(payload.campaignLifetime.adSpend)]);
    if (payload.campaignLifetime.roas != null) kpiDefs.push(["ROAS (lifetime)", `${(payload.campaignLifetime.roas as number).toFixed(2)}x`]);

    const cardW = (doc.page.width - 96 - 24) / 3;
    kpiDefs.forEach(([label, value], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 48 + col * (cardW + 12), cy = y + row * 72;
      doc.roundedRect(x, cy, cardW, 60, 6).fillAndStroke("#f9fafb", "#e5e7eb");
      doc.fill(GRAY).fontSize(8).font("Helvetica").text(label.toUpperCase(), x + 12, cy + 12);
      doc.fill(DARK).fontSize(16).font("Helvetica-Bold").text(value, x + 12, cy + 28);
    });
    y += Math.ceil(kpiDefs.length / 3) * 72 + 20;

    // Comparison
    const comp = payload.comparison as Record<string, { current: number; previous: number; change: number | null }>;
    const compKeys = Object.keys(comp);
    if (compKeys.length) {
      doc.fill(DARK).fontSize(13).font("Helvetica-Bold").text("Versus previous period", 48, y);
      y += 22;
      for (const k of compKeys) {
        const c = comp[k];
        doc.fill(GRAY).fontSize(10).font("Helvetica")
          .text(`${k === "revenue" ? "Revenue" : "Orders"}: ${k === "revenue" ? inr(c.current) : num(c.current)} vs ${k === "revenue" ? inr(c.previous) : num(c.previous)}   (${pct(c.change)})`, 48, y);
        y += 16;
      }
      y += 12;
    }

    // Campaign table
    const rows = payload.campaignTable ?? [];
    if (rows.length) {
      doc.fill(DARK).fontSize(13).font("Helvetica-Bold").text("Campaign performance", 48, y);
      y += 22;
      const cols = [
        { key: "name", label: "Campaign", w: 170 },
        { key: "channel", label: "Channel", w: 70 },
        { key: "spend", label: "Spend", w: 90 },
        { key: "revenue", label: "Revenue", w: 90 },
        { key: "roas", label: "ROAS", w: 60 },
      ].filter((c) => c.key === "name" || c.key === "channel" || rows.some((r: any) => r[c.key] !== undefined));
      let x = 48;
      doc.fontSize(8).font("Helvetica-Bold").fill(GRAY);
      for (const c of cols) { doc.text(c.label.toUpperCase(), x, y, { width: c.w }); x += c.w; }
      y += 14;
      doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor("#e5e7eb").stroke();
      y += 6;
      doc.font("Helvetica").fontSize(9).fill(DARK);
      for (const r of rows.slice(0, 20) as any[]) {
        if (y > doc.page.height - 100) { doc.addPage(); y = 48; }
        x = 48;
        for (const c of cols) {
          const v = c.key === "spend" || c.key === "revenue" ? inr(r[c.key])
            : c.key === "roas" ? (r.roas != null ? `${r.roas.toFixed(2)}x` : "—")
            : String(r[c.key] ?? "—");
          doc.text(v, x, y, { width: c.w - 8 });
          x += c.w;
        }
        y += 16;
      }
      y += 12;
    }

    // Best / worst
    if (payload.bestCampaign) {
      doc.fill(DARK).fontSize(13).font("Helvetica-Bold").text("Highlights", 48, y); y += 20;
      doc.fontSize(10).font("Helvetica").fill(GRAY)
        .text(`Best performing: ${(payload.bestCampaign as any).name}`, 48, y); y += 14;
      if (payload.worstCampaign) {
        doc.text(`Needs attention: ${(payload.worstCampaign as any).name}`, 48, y); y += 14;
      }
      y += 10;
    }

    // Footer
    doc.fontSize(8).fill("#9ca3af")
      .text(`Generated ${new Date(payload.generatedAt).toLocaleString("en-IN")} · ${payload.project.brandName} Marketing Report`, 48, doc.page.height - 60);

    doc.end();
  });
}
