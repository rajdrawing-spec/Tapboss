/**
 * PRD Section 11 access matrix for the unified Clients & Vendors directory:
 *  - Super admin: sees all companies' records.
 *  - Company-scoped staff: only their companies; tampered companyId → 403.
 *  - Row-restricted user (user_client_vendor_access): only assigned records.
 *  - Company list endpoint no longer leaks other companies to scoped users.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const H = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { client_vendors: [], user_client_vendor_access: [], users: [], companies: [], employees: [], orders: [], transactions: [] };
  function reset() { for (const k of Object.keys(store)) store[k] = []; }
  function makeTable(name: string) {
    return new Proxy({}, { get(_t, prop) { return prop === "__table" ? name : `${name}.${String(prop)}`; } });
  }
  const field = (col: string) => String(col).split(".")[1];
  function match(row: Row, cond: any): boolean {
    if (!cond) return true;
    switch (cond.op) {
      case "and": return cond.conds.filter(Boolean).every((c: any) => match(row, c));
      case "or": return cond.conds.filter(Boolean).some((c: any) => match(row, c));
      case "eq": return row[field(cond.col)] === cond.val;
      case "inArray": return cond.vals.includes(row[field(cond.col)]);
      case "ilike": {
        const v = row[field(cond.col)];
        const needle = String(cond.val).replace(/%/g, "").replace(/\\/g, "").toLowerCase();
        return v != null && String(v).toLowerCase().includes(needle);
      }
      default: return true;
    }
  }
  class QB {
    table: string | null = null; cols: any = null; cond: any = null;
    _limit: number | null = null; _offset = 0; _values: any = null; _set: any = null; kind = "select";
    select(cols?: any) { this.cols = cols ?? null; return this; }
    from(t: any) { this.table = t.__table; return this; }
    where(c: any) { this.cond = c; return this; }
    orderBy() { return this; }
    groupBy() { return this; }
    limit(n: number) { this._limit = n; return this; }
    offset(n: number) { this._offset = n; return this; }
    insert(t: any) { this.kind = "insert"; this.table = t.__table; return this; }
    values(v: any) { this._values = v; return this; }
    update(t: any) { this.kind = "update"; this.table = t.__table; return this; }
    set(v: any) { this._set = v; return this; }
    delete(t: any) { this.kind = "delete"; this.table = t.__table; return this; }
    returning() { return this; }
    then(res: (v: any) => void, rej: (e: any) => void) { try { res(this._exec()); } catch (e) { rej(e); } }
    _exec() {
      const arr = store[this.table!];
      if (this.kind === "insert") {
        const vals = Array.isArray(this._values) ? this._values : [this._values];
        const out = vals.map((v) => { const row = { id: arr.length + 1, ...v }; arr.push(row); return row; });
        return out;
      }
      if (this.kind === "update") {
        const rows = arr.filter((r) => match(r, this.cond));
        rows.forEach((r) => Object.assign(r, this._set));
        return rows.map((r) => ({ ...r }));
      }
      if (this.kind === "delete") {
        const keep = arr.filter((r) => !match(r, this.cond));
        const removed = arr.filter((r) => match(r, this.cond));
        store[this.table!] = keep;
        return removed;
      }
      let rows = arr.filter((r) => match(r, this.cond));
      if (this.cols && Object.values(this.cols).some((v: any) => v && v.op === "sql")) {
        return [{ total: rows.length }];
      }
      if (this._limit !== null) rows = rows.slice(this._offset, this._offset + this._limit);
      if (this.cols) return rows.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries(this.cols)) o[k] = r[field(String(c))]; return o; });
      return rows.map((r) => ({ ...r }));
    }
  }
  const db = {
    select: (cols?: any) => new QB().select(cols),
    insert: (t: any) => new QB().insert(t),
    update: (t: any) => new QB().update(t),
    delete: (t: any) => new QB().delete(t),
    execute: async () => ({ rows: [] }),
  };
  return { store, reset, db, makeTable };
});

vi.mock("@workspace/db", () => ({
  db: H.db,
  clientVendorsTable: H.makeTable("client_vendors"),
  userClientVendorAccessTable: H.makeTable("user_client_vendor_access"),
  usersTable: H.makeTable("users"),
  companiesTable: H.makeTable("companies"),
  employeesTable: H.makeTable("employees"),
  ordersTable: H.makeTable("orders"),
  transactionsTable: H.makeTable("transactions"),
  // Referenced by companies.ts's pre-delete dependent-record check — this
  // suite never calls DELETE /companies, so these just need to exist.
  customersTable: H.makeTable("customers"),
  shareholdersTable: H.makeTable("shareholders"),
  invoicesTable: H.makeTable("invoices"),
  documentsTable: H.makeTable("documents"),
  shipmentsTable: H.makeTable("shipments"),
  campaignsTable: H.makeTable("campaigns"),
  insertClientVendorSchema: { safeParse: (b: any) => (b && b.name && b.companyId && b.type ? { success: true, data: b } : { success: false }) },
  updateClientVendorSchema: { safeParse: (b: any) => ({ success: true, data: b }) },
  insertCompanySchema: { safeParse: () => ({ success: false }) },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: any) => ({ op: "eq", col, val }),
  and: (...conds: any[]) => ({ op: "and", conds }),
  or: (...conds: any[]) => ({ op: "or", conds }),
  inArray: (col: string, vals: any[]) => ({ op: "inArray", col, vals }),
  ilike: (col: string, val: any) => ({ op: "ilike", col, val }),
  desc: (col: string) => ({ op: "desc", col }),
  sql: (() => ({ op: "sql" })) as any,
}));

// Authz middleware: permission checks pass-through (matrix here tests scoping);
// requireSuperAdmin enforces role, mirroring production behavior.
vi.mock("../middleware/authz", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.localUser?.role === "super_admin") next();
    else res.status(403).json({ error: "Forbidden" });
  },
}));
vi.mock("../lib/audit", () => ({ writeAudit: vi.fn() }));

import clientVendorsRouter from "./client-vendors";
import companiesRouter from "./companies";

const ALPHA = 1, BETA = 2;
const SUPER = { id: 1, email: "tapashub@gmail.com", role: "super_admin", companyIds: [] };
const ALPHA_STAFF = { id: 2, email: "a@x.com", role: "staff", companyIds: [ALPHA] };
const RESTRICTED = { id: 3, email: "v@x.com", role: "vendor_user", companyIds: [ALPHA] };

let currentUser: any = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).localUser = currentUser; (req as any).log = { error: () => {} }; next(); });
app.use(clientVendorsRouter);
app.use(companiesRouter);

function seedCv(companyId: number, type = "client", name = "Acme") {
  const id = H.store.client_vendors.length + 1;
  H.store.client_vendors.push({ id, companyId, type, name, status: "active", createdAt: new Date() });
  return id;
}

beforeEach(() => { H.reset(); currentUser = null; });

describe("client-vendors company scoping", () => {
  beforeEach(() => { seedCv(ALPHA); seedCv(BETA); });

  it("super admin sees all records", async () => {
    currentUser = SUPER;
    const res = await request(app).get("/client-vendors");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("scoped staff only sees own-company records", async () => {
    currentUser = ALPHA_STAFF;
    const res = await request(app).get("/client-vendors");
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: any) => r.companyId)).toEqual([ALPHA]);
  });

  it("tampered companyId filter → 403", async () => {
    currentUser = ALPHA_STAFF;
    const res = await request(app).get(`/client-vendors?companyId=${BETA}`);
    expect(res.status).toBe(403);
  });

  it("GET /client-vendors/:id of another company → 404", async () => {
    currentUser = ALPHA_STAFF;
    const res = await request(app).get("/client-vendors/2");
    expect(res.status).toBe(404);
  });

  it("POST into a non-assigned company → 403", async () => {
    currentUser = ALPHA_STAFF;
    const res = await request(app).post("/client-vendors").send({ name: "X", companyId: BETA, type: "vendor" });
    expect(res.status).toBe(403);
  });

  it("PATCH/DELETE on another company's record → 404", async () => {
    currentUser = ALPHA_STAFF;
    expect((await request(app).patch("/client-vendors/2").send({ name: "Y" })).status).toBe(404);
    expect((await request(app).delete("/client-vendors/2")).status).toBe(404);
  });
});

describe("row-level client/vendor restriction", () => {
  it("restricted user only sees assigned records; unrestricted user sees all in company", async () => {
    const a = seedCv(ALPHA, "vendor", "V1");
    seedCv(ALPHA, "vendor", "V2");
    H.store.user_client_vendor_access.push({ id: 1, userId: RESTRICTED.id, clientVendorId: a });
    currentUser = RESTRICTED;
    const res = await request(app).get("/client-vendors");
    expect(res.body.items.map((r: any) => r.id)).toEqual([a]);
    expect((await request(app).get("/client-vendors/2")).status).toBe(404);

    currentUser = ALPHA_STAFF; // no restriction rows
    expect((await request(app).get("/client-vendors")).body.items).toHaveLength(2);
  });

  it("vendor_user with no assignment rows is denied by default", async () => {
    seedCv(ALPHA);
    currentUser = { id: 9, email: "vu@x.com", role: "vendor_user", companyIds: [ALPHA] };
    const res = await request(app).get("/client-vendors");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect((await request(app).get("/client-vendors/1")).status).toBe(404);
  });

  it("row-restricted user cannot create, or mutate records outside scope", async () => {
    const a = seedCv(ALPHA, "vendor", "V1");
    const b = seedCv(ALPHA, "vendor", "V2");
    H.store.user_client_vendor_access.push({ id: 1, userId: RESTRICTED.id, clientVendorId: a });
    currentUser = RESTRICTED;
    expect((await request(app).post("/client-vendors").send({ name: "N", companyId: ALPHA, type: "client" })).status).toBe(403);
    expect((await request(app).patch(`/client-vendors/${b}`).send({ name: "X" })).status).toBe(404);
    expect((await request(app).delete(`/client-vendors/${a}`)).status).toBe(403);
    expect((await request(app).patch(`/client-vendors/${a}`).send({ name: "Mine" })).status).toBe(200);
  });

  it("PUT access endpoint is super-admin only and validates ids", async () => {
    seedCv(ALPHA);
    H.store.users.push({ id: RESTRICTED.id, email: RESTRICTED.email });
    currentUser = ALPHA_STAFF;
    expect((await request(app).put(`/users/${RESTRICTED.id}/client-vendor-access`).send({ clientVendorIds: [1] })).status).toBe(403);
    currentUser = SUPER;
    expect((await request(app).put(`/users/${RESTRICTED.id}/client-vendor-access`).send({ clientVendorIds: [99] })).status).toBe(400);
    const ok = await request(app).put(`/users/${RESTRICTED.id}/client-vendor-access`).send({ clientVendorIds: [1] });
    expect(ok.status).toBe(200);
    expect(H.store.user_client_vendor_access.map((r) => r.clientVendorId)).toEqual([1]);
  });
});

describe("GET /companies scoping (leak fix)", () => {
  beforeEach(() => {
    H.store.companies.push(
      { id: ALPHA, name: "Alpha", createdAt: new Date() },
      { id: BETA, name: "Beta", createdAt: new Date() },
    );
  });

  it("scoped staff only sees assigned companies", async () => {
    currentUser = ALPHA_STAFF;
    const res = await request(app).get("/companies");
    expect(res.status).toBe(200);
    expect(res.body.map((c: any) => c.id)).toEqual([ALPHA]);
  });

  it("GET /companies/:id outside scope → 404", async () => {
    currentUser = ALPHA_STAFF;
    expect((await request(app).get(`/companies/${BETA}`)).status).toBe(404);
    expect((await request(app).get(`/companies/${ALPHA}`)).status).toBe(200);
  });

  it("super admin still sees everything", async () => {
    currentUser = SUPER;
    expect((await request(app).get("/companies")).body).toHaveLength(2);
  });
});
