import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, insertDocumentSchema } from "@workspace/db";
import { eq, and, desc, or, ilike, inArray } from "drizzle-orm";
import { isSafeAttachmentUrl } from "../lib/url-safety";
import { canAccessCompany, companyScope } from "../lib/company-scope";
import { clientVendorScope, accessibleClientVendor } from "../lib/client-vendor-scope";
import { requirePermission } from "../middleware/authz";

const router = Router();

/** Validate an incoming clientVendorId: must be accessible to the caller AND
 *  belong to the same company as the document (when both are set). */
async function cvAssociationError(req: any, clientVendorId: number, docCompanyId: number | null | undefined): Promise<string | null> {
  const cv = await accessibleClientVendor(req, clientVendorId);
  if (!cv) return "Forbidden client/vendor";
  if (docCompanyId != null && cv.companyId !== docCompanyId) return "Client/vendor belongs to a different company";
  return null;
}

router.get("/documents", requirePermission("documents.view"), async (req, res) => {
  try {
    const scope = companyScope(req);
    if (scope !== null && scope.length === 0) { res.json([]); return; }
    const { companyId, category, q } = req.query as Record<string, string>;
    const conds = [];
    if (companyId) {
      const cid = parseInt(companyId);
      if (scope !== null && !scope.includes(cid)) { res.status(403).json({ error: "Forbidden" }); return; }
      conds.push(eq(documentsTable.companyId, cid));
    }
    if (scope !== null) conds.push(inArray(documentsTable.companyId, scope));
    // Row-level client/vendor restriction: restricted users only see documents
    // linked to their assigned clients/vendors.
    const cvScope = await clientVendorScope(req);
    if (cvScope !== null) {
      if (cvScope.length === 0) { res.json([]); return; }
      conds.push(inArray(documentsTable.clientVendorId, cvScope));
    }
    const clientVendorId = (req.query as Record<string, string>).clientVendorId;
    if (clientVendorId) conds.push(eq(documentsTable.clientVendorId, parseInt(clientVendorId)));
    if (category && category !== "all") conds.push(eq(documentsTable.category, category));
    if (q) {
      const like = `%${q}%`;
      conds.push(or(ilike(documentsTable.name, like), ilike(documentsTable.issuer, like), ilike(documentsTable.referenceNumber, like))!);
    }
    const where = conds.length ? and(...conds) : undefined;
    const rows = await db.select().from(documentsTable).where(where).orderBy(desc(documentsTable.createdAt));
    res.json(rows);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to list documents" }); }
});

router.post("/documents", requirePermission("documents.manage"), async (req, res) => {
  try {
    const parsed = insertDocumentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    if (parsed.data.companyId != null && !canAccessCompany(req, parsed.data.companyId)) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!isSafeAttachmentUrl(parsed.data.fileUrl)) {
      res.status(400).json({ error: "Unsafe URL: only http(s) links or uploaded files are allowed" }); return;
    }
    if (parsed.data.clientVendorId != null) {
      const err = await cvAssociationError(req, parsed.data.clientVendorId, parsed.data.companyId);
      if (err) { res.status(403).json({ error: err }); return; }
    }
    const [d] = await db.insert(documentsTable).values(parsed.data).returning();
    res.status(201).json(d);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to create document" }); }
});

/** Row-level guard shared by PATCH/DELETE: a restricted user may only touch
 *  documents whose existing association falls inside their scope. */
async function canTouchDocument(req: any, existing: { companyId: number | null; clientVendorId: number | null }): Promise<boolean> {
  if (existing.companyId != null && !canAccessCompany(req, existing.companyId)) return false;
  const cvScope = await clientVendorScope(req);
  if (cvScope !== null && (existing.clientVendorId == null || !cvScope.includes(existing.clientVendorId))) return false;
  return true;
}

router.patch("/documents/:id", requirePermission("documents.manage"), async (req, res) => {
  try {
    const { id: _id, createdAt: _c, updatedAt: _u, companyId: _cid, ...body } = req.body ?? {};
    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, parseInt(String(req.params.id))));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canTouchDocument(req, existing))) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!isSafeAttachmentUrl(body.fileUrl)) {
      res.status(400).json({ error: "Unsafe URL: only http(s) links or uploaded files are allowed" }); return;
    }
    if (body.clientVendorId != null) {
      const err = await cvAssociationError(req, body.clientVendorId, existing.companyId);
      if (err) { res.status(403).json({ error: err }); return; }
    }
    const [d] = await db.update(documentsTable).set({ ...body, updatedAt: new Date() }).where(eq(documentsTable.id, parseInt(String(req.params.id)))).returning();
    if (!d) { res.status(404).json({ error: "Not found" }); return; }
    res.json(d);
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to update document" }); }
});

router.delete("/documents/:id", requirePermission("documents.manage"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canTouchDocument(req, existing))) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    res.json({ ok: true });
  } catch (e) { req.log.error(e); res.status(500).json({ error: "Failed to delete document" }); }
});

export default router;
