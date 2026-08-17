import type { Request } from "express";
import { db, userClientVendorAccessTable, clientVendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { isSuperAdmin } from "./auth-user";
import { canAccessCompany } from "./company-scope";

/** vendor_user is an external role: with no explicit assignments it must see
 *  NOTHING (deny-by-default), unlike internal users where no rows = unrestricted. */
function isVendorUser(u: User): boolean {
  return u.role === "vendor_user" || ((u.extraRoles as string[] | undefined) ?? []).includes("vendor_user");
}

/**
 * Row-level client/vendor scope for the caller.
 * - null  -> unrestricted (super admin, or user with NO restriction rows)
 * - array -> only these client_vendors ids are visible (may be empty)
 *
 * Cached on the request so multiple checks cost one query.
 * As with companyScope: never pass an empty array to drizzle `inArray`.
 */
export async function clientVendorScope(req: Request): Promise<number[] | null> {
  const r = req as any;
  if (r.__cvScope !== undefined) return r.__cvScope;
  const u = r.localUser as User | undefined;
  if (!u || isSuperAdmin(u)) { r.__cvScope = null; return null; }
  const rows = await db.select({ id: userClientVendorAccessTable.clientVendorId })
    .from(userClientVendorAccessTable)
    .where(eq(userClientVendorAccessTable.userId, u.id));
  r.__cvScope = rows.length === 0 ? (isVendorUser(u) ? [] : null) : rows.map((x) => x.id);
  return r.__cvScope;
}

/**
 * Full chain check for one client/vendor row:
 * company access -> row-level client/vendor access. Returns the row when
 * authorized, otherwise null (caller decides 403 vs 404).
 */
export async function accessibleClientVendor(req: Request, clientVendorId: number) {
  const [cv] = await db.select().from(clientVendorsTable)
    .where(eq(clientVendorsTable.id, clientVendorId));
  if (!cv) return null;
  if (!canAccessCompany(req, cv.companyId)) return null;
  const scope = await clientVendorScope(req);
  if (scope !== null && !scope.includes(cv.id)) return null;
  return cv;
}
