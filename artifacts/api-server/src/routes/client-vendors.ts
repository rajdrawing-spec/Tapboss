import { Router, type IRouter } from "express";
import {
  db, clientVendorsTable, userClientVendorAccessTable, usersTable, companiesTable,
  insertClientVendorSchema, updateClientVendorSchema,
} from "@workspace/db";
import { and, eq, desc, inArray, or, ilike, sql, type SQL } from "drizzle-orm";
import { requirePermission, requireSuperAdmin } from "../middleware/authz";
import { companyScope, canAccessCompany } from "../lib/company-scope";
import { clientVendorScope } from "../lib/client-vendor-scope";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

function actor(req: any) {
  return { userId: req.localUser?.id ?? null, userEmail: req.localUser?.email ?? null };
}

/** List/search with company, type, status, q filters + pagination. */
router.get("/client-vendors", requirePermission("clients_vendors.view"), async (req, res) => {
  try {
    const scope = companyScope(req);
    if (scope !== null && scope.length === 0) { res.json({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }); return; }
    const cvScope = await clientVendorScope(req);
    if (cvScope !== null && cvScope.length === 0) { res.json({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }); return; }

    const conds: SQL[] = [];
    if (scope !== null) conds.push(inArray(clientVendorsTable.companyId, scope));
    if (cvScope !== null) conds.push(inArray(clientVendorsTable.id, cvScope));

    const companyId = req.query.companyId ? parseInt(String(req.query.companyId)) : null;
    if (companyId !== null) {
      if (!Number.isFinite(companyId) || !canAccessCompany(req, companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
      conds.push(eq(clientVendorsTable.companyId, companyId));
    }
    const type = String(req.query.type ?? "");
    if (type === "client" || type === "vendor") conds.push(eq(clientVendorsTable.type, type));
    const status = String(req.query.status ?? "");
    if (status === "active" || status === "inactive") conds.push(eq(clientVendorsTable.status, status));
    const q = String(req.query.q ?? "").trim();
    if (q) {
      const pat = `%${q.replace(/[%_]/g, "\\$&")}%`;
      conds.push(or(
        ilike(clientVendorsTable.name, pat),
        ilike(clientVendorsTable.organizationName, pat),
        ilike(clientVendorsTable.contactPerson, pat),
        ilike(clientVendorsTable.email, pat),
        ilike(clientVendorsTable.phone, pat),
      )!);
    }

    const where = conds.length ? and(...conds) : undefined;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "25")) || 25));
    const [items, [{ total }]] = await Promise.all([
      db.select().from(clientVendorsTable).where(where)
        .orderBy(desc(clientVendorsTable.createdAt))
        .limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(clientVendorsTable).where(where),
    ]);
    res.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to list clients & vendors" }); }
});

router.get("/client-vendors/:id", requirePermission("clients_vendors.view"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [cv] = await db.select().from(clientVendorsTable).where(eq(clientVendorsTable.id, id));
    if (!cv || !canAccessCompany(req, cv.companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const cvScope = await clientVendorScope(req);
    if (cvScope !== null && !cvScope.includes(cv.id)) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cv);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to get record" }); }
});

router.post("/client-vendors", requirePermission("clients_vendors.manage"), async (req, res) => {
  try {
    const parsed = insertClientVendorSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    if (!canAccessCompany(req, parsed.data.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    // Row-restricted users may only work with their assigned records — never create new ones.
    if ((await clientVendorScope(req)) !== null) { res.status(403).json({ error: "Forbidden" }); return; }
    const [company] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.id, parsed.data.companyId));
    if (!company) { res.status(400).json({ error: "Unknown company" }); return; }
    const [cv] = await db.insert(clientVendorsTable).values(parsed.data).returning();
    void writeAudit({ ...actor(req), action: `${cv.type}.created`, targetType: "client_vendor", targetId: String(cv.id), description: `Created ${cv.type} "${cv.name}" in company ${cv.companyId}` });
    res.status(201).json(cv);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to create record" }); }
});

router.patch("/client-vendors/:id", requirePermission("clients_vendors.manage"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select().from(clientVendorsTable).where(eq(clientVendorsTable.id, id));
    if (!existing || !canAccessCompany(req, existing.companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const cvScope = await clientVendorScope(req);
    if (cvScope !== null && !cvScope.includes(existing.id)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = updateClientVendorSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    const [cv] = await db.update(clientVendorsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(clientVendorsTable.id, id)).returning();
    res.json(cv);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to update record" }); }
});

router.delete("/client-vendors/:id", requirePermission("clients_vendors.manage"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select().from(clientVendorsTable).where(eq(clientVendorsTable.id, id));
    if (!existing || !canAccessCompany(req, existing.companyId)) { res.status(404).json({ error: "Not found" }); return; }
    if ((await clientVendorScope(req)) !== null) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(userClientVendorAccessTable).where(eq(userClientVendorAccessTable.clientVendorId, id));
    await db.delete(clientVendorsTable).where(eq(clientVendorsTable.id, id));
    void writeAudit({ ...actor(req), action: `${existing.type}.deleted`, targetType: "client_vendor", targetId: String(id), description: `Deleted ${existing.type} "${existing.name}"` });
    res.json({ ok: true });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to delete record" }); }
});

/* ---------------- Per-user client/vendor access (Super Admin) ---------------- */

router.get("/users/:userId/client-vendor-access", requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    const rows = await db.select().from(userClientVendorAccessTable)
      .where(eq(userClientVendorAccessTable.userId, userId));
    res.json({ clientVendorIds: rows.map((r) => r.clientVendorId) });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to load access" }); }
});

router.put("/users/:userId/client-vendor-access", requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const ids = req.body?.clientVendorIds;
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) { res.status(400).json({ error: "clientVendorIds must be an array of integers" }); return; }
    // Validate every id exists (empty list = remove restriction entirely).
    if (ids.length > 0) {
      const found = await db.select({ id: clientVendorsTable.id }).from(clientVendorsTable)
        .where(inArray(clientVendorsTable.id, ids as number[]));
      if (found.length !== new Set(ids).size) { res.status(400).json({ error: "Unknown client/vendor id" }); return; }
    }
    const before = await db.select().from(userClientVendorAccessTable)
      .where(eq(userClientVendorAccessTable.userId, userId));
    await db.delete(userClientVendorAccessTable).where(eq(userClientVendorAccessTable.userId, userId));
    if (ids.length > 0) {
      await db.insert(userClientVendorAccessTable)
        .values((ids as number[]).map((clientVendorId) => ({ userId, clientVendorId })));
    }
    void writeAudit({
      ...actor(req), action: "client_vendor_access.updated", targetType: "user", targetId: String(userId),
      description: `Client/vendor restrictions for ${user.email}: ${ids.length === 0 ? "unrestricted" : ids.length + " record(s)"}`,
      metadata: { before: before.map((b) => b.clientVendorId), after: ids },
    });
    res.json({ clientVendorIds: ids });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to update access" }); }
});

export default router;
