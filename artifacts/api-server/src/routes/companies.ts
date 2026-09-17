import { Router } from "express";
import { db } from "@workspace/db";
import {
  companiesTable, insertCompanySchema,
  employeesTable, ordersTable, transactionsTable,
  customersTable, shareholdersTable, invoicesTable, documentsTable,
  shipmentsTable, campaignsTable,
} from "@workspace/db";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/authz";
import { companyScope, canAccessCompany } from "../lib/company-scope";
import { writeAudit } from "../lib/audit";

const router = Router();

router.get("/companies", async (req, res) => {
  try {
    // Batch all three queries in parallel for speed
    const [companies, empRows, revRows] = await Promise.all([
      db.select().from(companiesTable).orderBy(companiesTable.id),

      // Active employee count per company
      db
        .select({
          companyId: employeesTable.companyId,
          count: sql<number>`count(*)::int`,
        })
        .from(employeesTable)
        .where(eq(employeesTable.status, "active"))
        .groupBy(employeesTable.companyId),

      // Revenue = orders revenue + income transactions, both per company
      db.execute(sql`
        SELECT company_id,
               coalesce(sum(amount), 0)::numeric AS total_revenue
        FROM (
          SELECT company_id, total_amount AS amount FROM orders
          UNION ALL
          SELECT company_id, amount       AS amount FROM transactions WHERE type = 'income'
        ) src
        GROUP BY company_id
      `),
    ]);

    // Build lookup maps
    const empMap = new Map<number, number>(empRows.map((r) => [r.companyId, r.count]));
    const revMap = new Map<number, number>(
      (revRows.rows as { company_id: number; total_revenue: string }[]).map((r) => [
        Number(r.company_id),
        Number(r.total_revenue),
      ])
    );

    // Company-scope enforcement: non-super-admins only see their companies.
    const scope = companyScope(req);
    const visible = scope === null ? companies : companies.filter((c) => scope.includes(c.id));
    res.json(
      visible.map((c) =>
        formatCompany(c, empMap.get(c.id) ?? 0, revMap.get(c.id) ?? 0)
      )
    );
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to list companies" });
  }
});

router.post("/companies", requireSuperAdmin, async (req, res) => {
  try {
    const parsed = insertCompanySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    const [c] = await db.insert(companiesTable).values(parsed.data).returning();
    void writeAudit({
      userId: (req as any).localUser?.id ?? null, userEmail: (req as any).localUser?.email ?? null,
      action: "company.created", targetType: "company", targetId: String(c.id), description: `Created company "${c.name}"`,
    });
    res.status(201).json(formatCompany(c));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to create company" });
  }
});

router.get("/companies/:companyId", async (req, res) => {
  try {
    const id = parseInt(String(req.params.companyId));
    const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
    if (!c || !canAccessCompany(req, id)) { res.status(404).json({ error: "Not found" }); return; }

    // Live-computed, same as the list endpoint — the stored columns are never
    // updated after creation and would otherwise silently go stale here.
    const [empRow, revRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
        .where(and(eq(employeesTable.companyId, id), eq(employeesTable.status, "active"))),
      db.execute(sql`
        SELECT coalesce(sum(amount), 0)::numeric AS total_revenue
        FROM (
          SELECT total_amount AS amount FROM orders WHERE company_id = ${id}
          UNION ALL
          SELECT amount FROM transactions WHERE company_id = ${id} AND type = 'income'
        ) src
      `),
    ]);
    const employeeCount = Number(empRow[0]?.count ?? 0);
    const totalRevenue = Number((revRow.rows[0] as { total_revenue: string } | undefined)?.total_revenue ?? 0);

    res.json(formatCompany(c, employeeCount, totalRevenue));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to get company" });
  }
});

// Whitelist of fields a client may update (mirrors the OpenAPI CompanyUpdate
// contract). `slug`, `id`, and timestamps are intentionally immutable.
const UPDATABLE_FIELDS = [
  "name", "type", "industry", "ownershipPercent", "gstNumber", "panNumber",
  "address", "city", "state", "status", "archived", "logoUrl", "website",
  "description", "category", "country", "currency", "timezone", "brandColor",
] as const;

router.patch("/companies/:companyId", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.companyId));
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const f of UPDATABLE_FIELDS) {
      if (f in body && body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No updatable fields provided" });
      return;
    }

    if ("ownershipPercent" in updates) {
      const v = Number(updates.ownershipPercent);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        res.status(400).json({ error: "ownershipPercent must be a number between 0 and 100" });
        return;
      }
      updates.ownershipPercent = v;

      // When a shareholder row in this company's own cap table represents the
      // parent's stake, that number is derived automatically (see
      // recomputeOwnership in routes/shareholders.ts) — a direct edit here
      // would silently be overwritten on the next share change, so reject it
      // up front with a clear pointer to the real place to change it.
      const [linkedHolder] = await db
        .select({ id: shareholdersTable.id })
        .from(shareholdersTable)
        .where(and(eq(shareholdersTable.companyId, id), isNotNull(shareholdersTable.holderCompanyId)))
        .limit(1);
      if (linkedHolder) {
        res.status(400).json({
          error: "Ownership for this company is derived from its shareholder cap table — edit the linked holder there instead of setting it directly.",
        });
        return;
      }
    }

    const [c] = await db
      .update(companiesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companiesTable.id, id))
      .returning();
    if (!c) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCompany(c));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to update company" });
  }
});

// Tables holding records tenant-scoped to a company. Deleting a company while
// any of these still reference it would silently orphan them — there are no
// foreign-key constraints in this schema to catch it at the DB level, so it's
// enforced here instead.
const DEPENDENT_TABLES: [string, any][] = [
  ["employees", employeesTable],
  ["customers", customersTable],
  ["transactions", transactionsTable],
  ["orders", ordersTable],
  ["shareholders", shareholdersTable],
  ["invoices", invoicesTable],
  ["documents", documentsTable],
  ["shipments", shipmentsTable],
  ["campaigns", campaignsTable],
];

async function dependentRecordCounts(companyId: number): Promise<Record<string, number>> {
  const counts = await Promise.all(
    DEPENDENT_TABLES.map(async ([name, table]) => {
      const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(eq(table.companyId, companyId));
      return [name, Number(row?.count ?? 0)] as const;
    })
  );
  return Object.fromEntries(counts);
}

router.delete("/companies/:companyId", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.companyId));

    const dependents = await dependentRecordCounts(id);
    const blocking = Object.fromEntries(Object.entries(dependents).filter(([, count]) => count > 0));
    if (Object.keys(blocking).length > 0) {
      res.status(409).json({
        error: "This company still has records attached and can't be deleted.",
        details: blocking,
        hint: "Archive it instead, or remove/reassign its employees, transactions, customers and other records first.",
      });
      return;
    }

    const [c] = await db.delete(companiesTable).where(eq(companiesTable.id, id)).returning();
    if (!c) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to delete company" });
  }
});

function formatCompany(
  c: typeof companiesTable.$inferSelect,
  employeeCount?: number,
  totalRevenue?: number,
) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    type: c.type,
    industry: c.industry,
    ownershipPercent: c.ownershipPercent,
    gstNumber: c.gstNumber,
    panNumber: c.panNumber,
    address: c.address,
    city: c.city,
    state: c.state,
    status: c.status,
    archived: c.archived,
    logoUrl: c.logoUrl,
    website: c.website,
    description: c.description,
    category: c.category,
    country: c.country,
    currency: c.currency,
    timezone: c.timezone,
    brandColor: c.brandColor,
    // Use live-computed values when provided (list endpoint), else fall back
    // to the stored column (single-company GET, create, patch, delete).
    employeeCount: employeeCount ?? c.employeeCount,
    totalRevenue: totalRevenue ?? c.totalRevenue,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;
