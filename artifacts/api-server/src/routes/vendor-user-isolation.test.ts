/**
 * End-to-end (cross-module) regression for vendor-user row-level isolation.
 * One fake DB, the REAL client-vendor-scope logic (unmocked), and the real
 * client-vendors, documents, and ai-tasks routers mounted together.
 *
 * Scenario: vendor user "V" is assigned client_vendor #1 (Acme) in company 1.
 * Company 1 also has client_vendor #2 (Globex), documents and tasks linked to
 * each, plus unlinked ones. V must only ever see Acme-linked records, and
 * direct-by-id access to anything else must 403/404.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const H = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    client_vendors: [], user_client_vendor_access: [], documents: [],
    generated_tasks: [], employees: [], users: [], companies: [], orders: [], transactions: [],
  };
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
        return v != null && String(v).toLowerCase().includes(String(cond.val).replace(/%/g, "").toLowerCase());
      }
      default: return true;
    }
  }
  class QB {
    table: string | null = null; cols: any = null; cond: any = null;
    _limit: number | null = null; _offset = 0; _values: any = null; _set: any = null; kind = "select";
    select(cols?: any) { this.cols = cols ?? null; return this; }
    from(t: any) { this.table = t.__table; return this; }
    leftJoin() { return this; }
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
    onConflictDoNothing() { return this; }
    for() { return this; }
    then(res: (v: any) => void, rej: (e: any) => void) { try { res(this._exec()); } catch (e) { rej(e); } }
    _exec() {
      const arr = store[this.table!];
      if (this.kind === "insert") {
        const vals = Array.isArray(this._values) ? this._values : [this._values];
        return vals.map((v) => { const row = { id: arr.length + 1, ...v }; arr.push(row); return row; });
      }
      if (this.kind === "update") {
        const rows = arr.filter((r) => match(r, this.cond));
        rows.forEach((r) => Object.assign(r, this._set));
        return rows.map((r) => ({ ...r }));
      }
      if (this.kind === "delete") {
        const removed = arr.filter((r) => match(r, this.cond));
        store[this.table!] = arr.filter((r) => !match(r, this.cond));
        return removed;
      }
      let rows = arr.filter((r) => match(r, this.cond));
      if (this.cols && Object.values(this.cols).some((v: any) => v && v.op === "sql")) return [{ total: rows.length }];
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
  documentsTable: H.makeTable("documents"),
  generatedTasksTable: H.makeTable("generated_tasks"),
  employeesTable: H.makeTable("employees"),
  usersTable: H.makeTable("users"),
  companiesTable: H.makeTable("companies"),
  ordersTable: H.makeTable("orders"),
  transactionsTable: H.makeTable("transactions"),
  insertDocumentSchema: { safeParse: (b: any) => (b && b.name ? { success: true, data: b } : { success: false }) },
  insertClientVendorSchema: { safeParse: (b: any) => (b && b.name && b.companyId && b.type ? { success: true, data: b } : { success: false }) },
  updateClientVendorSchema: { safeParse: (b: any) => ({ success: true, data: b }) },
  insertTaskTemplateSchema: {}, updateTaskTemplateSchema: {},
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
// Real vendor_user permission set (mirrors lib/permissions.ts) — manage
// endpoints must 403 BEFORE any scope handling runs.
const VENDOR_PERMS = ["dashboard.view", "ai_tasks.read", "documents.view", "chat.read", "meetings.read", "clients_vendors.view"];
vi.mock("../middleware/authz", () => ({
  requirePermission: (perm: string) => (req: any, res: any, next: any) => {
    const role = req.localUser?.role;
    if (role === "super_admin") { next(); return; }
    if (role === "vendor_user" && !VENDOR_PERMS.includes(perm)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.localUser?.role === "super_admin") next(); else res.status(403).json({ error: "Forbidden" });
  },
}));
vi.mock("../lib/audit", () => ({ writeAudit: vi.fn() }));
// ai-tasks router service stubs (only scoped read paths are exercised here)
vi.mock("../lib/ai-tasks/task-template.service", () => ({ listTemplates: vi.fn(), getTemplate: vi.fn(), createTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn() }));
vi.mock("../lib/ai-tasks/config.service", () => ({ isAiTasksEnabled: async () => true, getAiTasksConfig: vi.fn(), setAiTasksConfig: vi.fn() }));
vi.mock("../lib/ai-tasks/ai-task.service", () => ({ generateDailyTasks: vi.fn() }));
vi.mock("../lib/ai-tasks/task-approval.service", () => ({ approveTask: vi.fn(), rejectTask: vi.fn(), completeTask: vi.fn(async () => ({ ok: true })), approveAll: vi.fn(), rejectAll: vi.fn(), regenerateTasks: vi.fn(), getTaskStats: vi.fn(async () => ({ total: 99 })) }));
vi.mock("../lib/ai-tasks/employee-profile.service", () => ({ listEmployeesForGeneration: vi.fn(), updateEmployeeProfile: vi.fn(), syncEmployeesFromUsers: vi.fn() }));
vi.mock("../lib/ai-tasks/task-generation-job.service", () => ({ listJobs: vi.fn() }));
vi.mock("../lib/ai-tasks/ai-task-settings.service", () => ({ getCompanySettings: vi.fn(), updateCompanySettings: vi.fn(), listHolidays: vi.fn(), createHoliday: vi.fn(), deleteHoliday: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), deleteProject: vi.fn() }));
vi.mock("../lib/ai-tasks/analytics.service", () => ({ getAnalytics: vi.fn(), getHistoricalTrend: vi.fn() }));
vi.mock("../lib/ai-tasks/prompts.service", () => ({ getActivePrompt: vi.fn(), listPrompts: vi.fn(), createPromptVersion: vi.fn(), setActivePrompt: vi.fn() }));
vi.mock("../lib/ai-tasks/notification.service", () => ({ getUnreadAiTasksCount: vi.fn() }));

import clientVendorsRouter from "./client-vendors";
import documentsRouter from "./documents";
import aiTasksRouter from "./ai-tasks";

const TODAY = new Date().toISOString().slice(0, 10);
const VENDOR = { id: 7, email: "vendor@x.com", role: "vendor_user", companyIds: [1] };
let currentUser: any = VENDOR;

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.localUser = currentUser; req.log = { error: vi.fn() }; next(); });
app.use(clientVendorsRouter);
app.use(documentsRouter);
app.use(aiTasksRouter);

function seed() {
  H.store.companies.push({ id: 1, name: "Co1" });
  H.store.client_vendors.push(
    { id: 1, companyId: 1, name: "Acme", type: "client", status: "active" },
    { id: 2, companyId: 1, name: "Globex", type: "vendor", status: "active" },
  );
  H.store.documents.push(
    { id: 1, companyId: 1, name: "Acme contract", clientVendorId: 1, fileUrl: "https://x/a.pdf", category: "legal" },
    { id: 2, companyId: 1, name: "Globex contract", clientVendorId: 2, fileUrl: "https://x/b.pdf", category: "legal" },
    { id: 3, companyId: 1, name: "Internal policy", clientVendorId: null, fileUrl: "https://x/c.pdf", category: "hr" },
  );
  H.store.employees.push({ id: 5, companyId: 1, firstName: "V", lastName: "U" });
  H.store.generated_tasks.push(
    { id: 1, companyId: 1, employeeId: 5, generatedDate: TODAY, title: "Acme task", clientVendorId: 1, status: "approved", priority: "high" },
    { id: 2, companyId: 1, employeeId: 5, generatedDate: TODAY, title: "Globex task", clientVendorId: 2, status: "approved", priority: "high" },
    { id: 3, companyId: 1, employeeId: 5, generatedDate: TODAY, title: "Unlinked task", clientVendorId: null, status: "draft", priority: "low" },
  );
}
const assignAcme = () => H.store.user_client_vendor_access.push({ id: 1, userId: VENDOR.id, clientVendorId: 1 });

beforeEach(() => { H.reset(); currentUser = VENDOR; seed(); });

describe("vendor user assigned to one client/vendor", () => {
  beforeEach(assignAcme);

  it("directory: sees only the assigned record; direct id access to others 404s", async () => {
    const list = await request(app).get("/client-vendors");
    expect(list.body.items.map((r: any) => r.id)).toEqual([1]);
    expect((await request(app).get("/client-vendors/1")).status).toBe(200);
    expect((await request(app).get("/client-vendors/2")).status).toBe(404);
  });

  it("documents: list shows only Acme-linked docs; others untouchable by id", async () => {
    const list = await request(app).get("/documents");
    expect(list.body.map((d: any) => d.id)).toEqual([1]);
    // direct-by-id mutation of a Globex doc and an unlinked doc are forbidden
    expect((await request(app).patch("/documents/2").send({ name: "x" })).status).toBe(403);
    expect((await request(app).delete("/documents/3")).status).toBe(403);
    // filtering by an unassigned clientVendorId leaks nothing
    const probe = await request(app).get("/documents?clientVendorId=2");
    expect(probe.body).toEqual([]);
  });

  it("tasks: my-tasks returns only Acme-linked tasks, stats derived from them", async () => {
    const res = await request(app).get(`/ai-tasks/my-tasks?companyId=1&employeeId=5&runDate=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: any) => t.id)).toEqual([1]);
    expect(res.body.stats.total).toBe(1); // NOT the aggregate 99 from getTaskStats
  });

  it("manage endpoints 403 at the permission layer, before scope handling", async () => {
    // documents.manage
    expect((await request(app).post("/documents").send({ name: "x", companyId: 1, fileUrl: "https://x/y.pdf" })).status).toBe(403);
    expect((await request(app).patch("/documents/1").send({ name: "x" })).status).toBe(403);
    expect((await request(app).delete("/documents/1")).status).toBe(403);
    // clients_vendors.manage
    expect((await request(app).post("/client-vendors").send({ name: "N", companyId: 1, type: "client" })).status).toBe(403);
    // ai_tasks.manage (task re-link + approval options)
    expect((await request(app).patch("/ai-tasks/1/client-vendor").send({ companyId: 1, clientVendorId: 1 })).status).toBe(403);
    expect((await request(app).get("/ai-tasks/client-vendor-options?companyId=1")).status).toBe(403);
    // nothing was mutated
    expect(H.store.documents).toHaveLength(3);
    expect(H.store.generated_tasks[0].clientVendorId).toBe(1);
  });

  it("can complete an assigned task but NOT unassigned or unlinked ones by direct id", async () => {
    // Globex-linked task
    expect((await request(app).patch("/ai-tasks/2/complete").send({ companyId: 1, employeeId: 5 })).status).toBe(404);
    // unlinked task
    expect((await request(app).patch("/ai-tasks/3/complete").send({ companyId: 1, employeeId: 5 })).status).toBe(404);
    expect(H.store.generated_tasks[1].status).toBe("approved");
    expect(H.store.generated_tasks[2].status).toBe("draft");
    // assigned (Acme-linked) task passes scope and reaches the service
    const ok = await request(app).patch("/ai-tasks/1/complete").send({ companyId: 1, employeeId: 5 });
    expect(ok.status).toBe(200);
  });

  it("a privileged staff caller with row restrictions cannot re-link a task outside scope", async () => {
    currentUser = { id: 9, email: "s@x.com", role: "staff", companyIds: [1] };
    H.store.user_client_vendor_access.push({ id: 2, userId: 9, clientVendorId: 1 });
    const res = await request(app).patch("/ai-tasks/1/client-vendor").send({ companyId: 1, clientVendorId: 2 });
    expect(res.status).toBe(404);
    expect(H.store.generated_tasks[0].clientVendorId).toBe(1);
  });
});

describe("vendor user with NO assignments (deny-by-default)", () => {
  it("sees nothing anywhere", async () => {
    expect((await request(app).get("/client-vendors")).body.items).toEqual([]);
    expect((await request(app).get("/documents")).body).toEqual([]);
    const tasks = await request(app).get(`/ai-tasks/my-tasks?companyId=1&employeeId=5&runDate=${TODAY}`);
    expect(tasks.body.tasks).toEqual([]);
    expect(tasks.body.stats.total).toBe(0);
    // options endpoint requires ai_tasks.manage, which vendor users lack
    expect((await request(app).get("/ai-tasks/client-vendor-options?companyId=1")).status).toBe(403);
  });
});

describe("extra_roles vendor_user is treated the same", () => {
  it("staff with extra vendor_user role and no rows is denied by default", async () => {
    currentUser = { id: 8, email: "e@x.com", role: "staff", extraRoles: ["vendor_user"], companyIds: [1] };
    expect((await request(app).get("/documents")).body).toEqual([]);
    expect((await request(app).get("/client-vendors")).body.items).toEqual([]);
  });
});
