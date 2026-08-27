import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, companiesTable, insertProductSchema } from "@workspace/db";
import { eq, and, ilike, lte, sql, desc, inArray, ne } from "drizzle-orm";
import { emitNotification } from "../lib/notify";
import { requirePermission } from "../middleware/authz";
import { canAccessCompany, companyScope } from "../lib/company-scope";
import { randomUUID } from "node:crypto";
import { canAssociateProductImage } from "../lib/product-media-access";

const router = Router();
const createProductSchema = insertProductSchema.extend({
  sku: insertProductSchema.shape.sku.optional().default(""),
});

// Emit only when a product *crosses* into low-stock (or is created low), never
// on every subsequent update while it stays low — otherwise notifications spam.
function maybeNotifyLowStock(p: typeof productsTable.$inferSelect, companyName: string | null, prevStock?: number) {
  const nowLow = p.stockQuantity <= p.reorderLevel;
  const wasLow = prevStock != null && prevStock <= p.reorderLevel;
  if (nowLow && !wasLow) {
    void emitNotification({
      type: "inventory", severity: "warning", companyId: p.companyId, companyName,
      title: "Inventory Low",
      message: `${p.name} is low on stock — ${p.stockQuantity} left (reorder at ${p.reorderLevel}).`,
      actionUrl: "/inventory",
    });
  }
}

function strictPositiveId(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

function isSkuConflict(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505" || (error instanceof Error && error.message === "SKU_CONFLICT");
}

async function assertUniqueSku(tx: any, companyId: number, sku: string, excludeId?: number) {
  const normalized = sku.trim().toLowerCase();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:${normalized}`}))`);
  const condition = and(
    eq(productsTable.companyId, companyId),
    sql`lower(${productsTable.sku}) = ${normalized}`,
    excludeId == null ? undefined : ne(productsTable.id, excludeId),
  );
  const [duplicate] = await tx.select({ id: productsTable.id }).from(productsTable).where(condition).limit(1);
  if (duplicate) throw new Error("SKU_CONFLICT");
}

function generateProductSku(name: string, category: string) {
  const prefix = category.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "PRD";
  const product = name.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() || "ITEM";
  return `${prefix}-${product}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

router.get("/products", requirePermission("inventory.view"), async (req, res) => {
  try {
    const { companyId, search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const requestedCompanyId = companyId == null ? null : strictPositiveId(companyId);
    const pageNum = strictPositiveId(page);
    const limitNum = strictPositiveId(limit);
    if ((companyId != null && requestedCompanyId == null) || pageNum == null || limitNum == null || limitNum > 200) {
      res.status(400).json({ error: "Invalid query parameters" }); return;
    }
    if (requestedCompanyId != null && !canAccessCompany(req, requestedCompanyId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (requestedCompanyId != null) conditions.push(eq(productsTable.companyId, requestedCompanyId));
    else {
      const scope = companyScope(req);
      if (scope?.length === 0) {
        res.json({ items: [], total: 0, page: pageNum, limit: limitNum }); return;
      }
      if (scope) conditions.push(inArray(productsTable.companyId, scope));
    }
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(productsTable).where(where);
    const items = await db
      .select()
      .from(productsTable)
      .where(where)
      .orderBy(desc(productsTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    const companies = await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable);
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]));

    res.json({
      items: items.map(p => formatProduct(p, companyMap)),
      total: Number(count),
      page: pageNum,
      limit: limitNum,
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to list products" });
  }
});

router.post("/products", requirePermission("inventory.manage"), async (req, res) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    if (!canAccessCompany(req, parsed.data.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const sku = parsed.data.sku.trim() || generateProductSku(parsed.data.name, parsed.data.category);
    if (parsed.data.imageUrl && !await canAssociateProductImage(parsed.data.imageUrl, parsed.data.companyId)) {
      res.status(403).json({ error: "Product image is not owned by this company" }); return;
    }
    const p = await db.transaction(async (tx) => {
      await assertUniqueSku(tx, parsed.data.companyId, sku);
      const [created] = await tx.insert(productsTable).values({ ...parsed.data, sku }).returning();
      return created;
    });
    const [c] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, p.companyId));
    maybeNotifyLowStock(p, c?.name ?? null);
    res.status(201).json(formatProduct(p, { [p.companyId]: c?.name ?? "Unknown" }));
  } catch (e) {
    if (isSkuConflict(e)) { res.status(409).json({ error: "SKU already exists for this company" }); return; }
    req.log.error(e);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.delete("/products/:productId", requirePermission("inventory.manage"), async (req, res) => {
  try {
    const id = strictPositiveId(req.params.productId);
    if (id == null) { res.status(400).json({ error: "Invalid product ID" }); return; }
    const [existing] = await db.select({ companyId: productsTable.companyId }).from(productsTable).where(eq(productsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!canAccessCompany(req, existing.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [p] = await db.delete(productsTable).where(and(eq(productsTable.id, id), eq(productsTable.companyId, existing.companyId))).returning();
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to delete product" }); }
});

router.get("/inventory/low-stock", requirePermission("inventory.view"), async (req, res) => {
  try {
    const { companyId } = req.query as Record<string, string>;
    const conditions = [lte(productsTable.stockQuantity, productsTable.reorderLevel)];
    const requestedCompanyId = companyId == null ? null : strictPositiveId(companyId);
    if (companyId != null && requestedCompanyId == null) { res.status(400).json({ error: "Invalid company ID" }); return; }
    if (requestedCompanyId != null) {
      if (!canAccessCompany(req, requestedCompanyId)) { res.status(403).json({ error: "Forbidden" }); return; }
      conditions.push(eq(productsTable.companyId, requestedCompanyId));
    } else {
      const scope = companyScope(req);
      if (scope?.length === 0) { res.json([]); return; }
      if (scope) conditions.push(inArray(productsTable.companyId, scope));
    }
    
    const items = await db.select().from(productsTable).where(and(...conditions)).limit(50);
    const companies = await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable);
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]));
    res.json(items.map(p => formatProduct(p, companyMap)));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to get low stock items" });
  }
});

router.get("/inventory/warehouse-summary", requirePermission("inventory.view"), async (req, res) => {
  try {
    const scope = companyScope(req);
    if (scope?.length === 0) { res.json([]); return; }
    const companies = await db.select().from(companiesTable).where(and(
      eq(companiesTable.status, "active"),
      scope ? inArray(companiesTable.id, scope) : undefined,
    ));
    const summaries = await Promise.all(
      companies.map(async (c) => {
        const [stats] = await db
          .select({
            totalProducts: sql<number>`count(*)`,
            totalStockValue: sql<number>`coalesce(sum(stock_quantity * cost_price), 0)`,
            lowStockCount: sql<number>`count(*) filter (where stock_quantity <= reorder_level and stock_quantity > 0)`,
            outOfStockCount: sql<number>`count(*) filter (where stock_quantity = 0)`,
          })
          .from(productsTable)
          .where(eq(productsTable.companyId, c.id));
        return {
          companyId: c.id,
          companyName: c.name,
          totalProducts: Number(stats?.totalProducts ?? 0),
          totalStockValue: Number(stats?.totalStockValue ?? 0),
          lowStockCount: Number(stats?.lowStockCount ?? 0),
          outOfStockCount: Number(stats?.outOfStockCount ?? 0),
        };
      })
    );
    res.json(summaries);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to get warehouse summary" });
  }
});

router.get("/products/:productId", requirePermission("inventory.view"), async (req, res) => {
  try {
    const id = strictPositiveId(req.params.productId);
    if (id == null) { res.status(400).json({ error: "Invalid product ID" }); return; }
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    if (!canAccessCompany(req, p.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [c] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, p.companyId));
    res.json(formatProduct(p, { [p.companyId]: c?.name ?? "Unknown" }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to get product" });
  }
});

const PATCH_FIELDS = new Set([
  "companyId", "name", "sku", "barcode", "brand", "category", "subcategory", "description",
  "shortDescription", "price", "mrp", "costPrice", "gst", "weight", "dimensions",
  "hsn", "stockQuantity", "reorderLevel", "warehouseLocation", "imageUrl",
  "sourceLink", "status",
]);

router.patch("/products/:productId", requirePermission("inventory.manage"), async (req, res) => {
  try {
    const id = strictPositiveId(req.params.productId);
    if (id == null) { res.status(400).json({ error: "Invalid product ID" }); return; }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) { res.status(400).json({ error: "Invalid input" }); return; }
    const unknown = Object.keys(req.body).filter(key => !PATCH_FIELDS.has(key));
    if (unknown.length) { res.status(400).json({ error: `Fields cannot be updated: ${unknown.join(", ")}` }); return; }
    if (Object.keys(req.body).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    const parsed = insertProductSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    const [before] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }
    if (!canAccessCompany(req, before.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const updates = parsed.data as Partial<typeof productsTable.$inferInsert>;
    if (updates.companyId != null && updates.companyId !== before.companyId) {
      res.status(400).json({ error: "A product cannot be moved to another company" }); return;
    }
    delete updates.companyId;
    if (updates.sku != null) {
      updates.sku = updates.sku.trim();
      if (!updates.sku) { res.status(400).json({ error: "SKU is required" }); return; }
    }
    if (updates.imageUrl && !await canAssociateProductImage(updates.imageUrl, before.companyId)) {
      res.status(403).json({ error: "Product image is not owned by this company" }); return;
    }
    const p = await db.transaction(async (tx) => {
      if (updates.sku != null) await assertUniqueSku(tx, before.companyId, updates.sku, id);
      const [updated] = await tx.update(productsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(productsTable.id, id), eq(productsTable.companyId, before.companyId)))
        .returning();
      return updated;
    });
    const [c] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, p.companyId));
    maybeNotifyLowStock(p, c?.name ?? null, before?.stockQuantity);
    res.json(formatProduct(p, { [p.companyId]: c?.name ?? "Unknown" }));
  } catch (e) {
    if (isSkuConflict(e)) { res.status(409).json({ error: "SKU already exists for this company" }); return; }
    req.log.error(e);
    res.status(500).json({ error: "Failed to update product" });
  }
});

function formatProduct(p: typeof productsTable.$inferSelect, companyMap: Record<number, string>) {
  return {
    id: p.id,
    companyId: p.companyId,
    companyName: companyMap[p.companyId] ?? "Unknown",
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    description: p.description,
    shortDescription: p.shortDescription,
    price: p.price,
    mrp: p.mrp,
    costPrice: p.costPrice,
    gst: p.gst,
    weight: p.weight,
    dimensions: p.dimensions,
    hsn: p.hsn,
    stockQuantity: p.stockQuantity,
    reorderLevel: p.reorderLevel,
    warehouseLocation: p.warehouseLocation,
    imageUrl: p.imageUrl,
    sourceLink: p.sourceLink,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

export default router;
