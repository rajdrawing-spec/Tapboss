import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * GET /storage/objects/* previously served any private object to any
 * authenticated user with no company check at all (the ACL example in the
 * original scaffold was commented out). Object paths are unguessable UUIDs,
 * but a leaked link or screenshot would have bypassed company scope entirely.
 *
 * This proves the route now looks up the object's owning company (via
 * documents / product images / legacy product imageUrl) and rejects a
 * request from a user who isn't scoped to that company, while still serving
 * objects that belong to the caller's own company or that aren't tracked in
 * any of those tables (unchanged legacy behavior).
 */

const H = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { documents: [], product_images: [], product_media_uploads: [], products: [] };
  function reset() { for (const k of Object.keys(store)) store[k] = []; }
  function makeTable(name: string) {
    return new Proxy({}, { get(_t, prop) { return prop === "__table" ? name : `${name}.${String(prop)}`; } });
  }
  const documentsTable = makeTable("documents");
  const productImagesTable = makeTable("product_images");
  const productMediaUploadsTable = makeTable("product_media_uploads");
  const productsTable = makeTable("products");

  const field = (col: string) => String(col).split(".")[1];
  function match(row: Row, cond: any): boolean {
    if (!cond) return true;
    return cond.op === "eq" ? row[field(cond.col)] === cond.val : true;
  }
  class QB {
    table: string | null = null; cols: any = null; cond: any = null; _limit: number | null = null;
    select(cols?: any) { this.cols = cols ?? null; return this; }
    from(t: any) { this.table = t.__table; return this; }
    where(c: any) { this.cond = c; return this; }
    limit(n: number) { this._limit = n; return this; }
    then(res: (v: any) => void, rej: (e: any) => void) { try { res(this._exec()); } catch (e) { rej(e); } }
    _exec() {
      let rows = store[this.table!].filter((r) => match(r, this.cond));
      if (this._limit != null) rows = rows.slice(0, this._limit);
      if (this.cols) return rows.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries(this.cols!)) o[k] = r[field(String(c))]; return o; });
      return rows.map((r) => ({ ...r }));
    }
  }
  const db = { select: (cols?: any) => new QB().select(cols) };
  return { store, reset, db, documentsTable, productImagesTable, productMediaUploadsTable, productsTable };
});

vi.mock("@workspace/db", () => ({
  db: H.db,
  documentsTable: H.documentsTable,
  productImagesTable: H.productImagesTable,
  productMediaUploadsTable: H.productMediaUploadsTable,
  productsTable: H.productsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: any) => ({ op: "eq", col, val }),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
  ObjectStorageService: class {
    async getObjectEntityFile(objectPath: string) { return { objectPath }; }
    async downloadObject() {
      return { status: 200, headers: new Map([["content-type", "image/png"]]), body: null };
    }
  },
}));

import storageRouter from "./storage";

const ALPHA = 1, BETA = 2;
let currentUser: any = null;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).localUser = currentUser; (req as any).log = { error: () => {}, warn: () => {} }; next(); });
  app.use("/api", storageRouter);
  return app;
}
const app = buildApp();

beforeEach(() => {
  H.reset();
  currentUser = { id: 2, email: "staff@alpha.example.com", role: "operations_manager", companyIds: [ALPHA] };
});

describe("GET /storage/objects/* company-scope check", () => {
  it("rejects a document belonging to a company outside the caller's scope (403)", async () => {
    H.store.documents.push({ id: 1, companyId: BETA, fileUrl: "/objects/entities/docs/secret" });
    const res = await request(app).get("/api/storage/objects/entities/docs/secret");
    expect(res.status).toBe(403);
  });

  it("serves a document belonging to the caller's own company", async () => {
    H.store.documents.push({ id: 1, companyId: ALPHA, fileUrl: "/objects/entities/docs/ours" });
    const res = await request(app).get("/api/storage/objects/entities/docs/ours");
    expect(res.status).toBe(200);
  });

  it("rejects a product image belonging to another company (403)", async () => {
    H.store.product_images.push({ id: 1, companyId: BETA, objectPath: "/objects/entities/products/x" });
    const res = await request(app).get("/api/storage/objects/entities/products/x");
    expect(res.status).toBe(403);
  });

  it("serves an object with no matching record in any tracked table (unchanged legacy behavior)", async () => {
    const res = await request(app).get("/api/storage/objects/entities/untracked/y");
    expect(res.status).toBe(200);
  });

  it("a super admin (no company scope restriction) can access any company's document", async () => {
    currentUser = { id: 1, email: "owner@tapashub.com", role: "super_admin", companyIds: [] };
    H.store.documents.push({ id: 1, companyId: BETA, fileUrl: "/objects/entities/docs/secret" });
    const res = await request(app).get("/api/storage/objects/entities/docs/secret");
    expect(res.status).toBe(200);
  });
});
