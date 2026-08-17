/**
 * PATCH /ai-tasks/:id/client-vendor — task↔client/vendor association:
 *  - links a task to an accessible client/vendor in the same company
 *  - rejects a cross-company client/vendor (400)
 *  - 404s a client/vendor outside the caller's row-level scope
 *  - 403s a tampered companyId; can clear the link with null
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const H = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { generated_tasks: [], client_vendors: [], user_client_vendor_access: [], employees: [] };
  function reset() { for (const k of Object.keys(store)) store[k] = []; }
  function makeTable(name: string) {
    return new Proxy({}, { get(_t, prop) { return prop === "__table" ? name : `${name}.${String(prop)}`; } });
  }
  const field = (col: string) => String(col).split(".")[1];
  function match(row: Row, cond: any): boolean {
    if (!cond) return true;
    switch (cond.op) {
      case "and": return cond.conds.filter(Boolean).every((c: any) => match(row, c));
      case "eq": return row[field(cond.col)] === cond.val;
      case "inArray": return cond.vals.includes(row[field(cond.col)]);
      default: return true;
    }
  }
  class QB {
    table: string | null = null; cols: any = null; cond: any = null; _limit: number | null = null; _set: any = null; kind = "select";
    select(cols?: any) { this.cols = cols ?? null; return this; }
    from(t: any) { this.table = t.__table; return this; }
    leftJoin() { return this; }
    where(c: any) { this.cond = c; return this; }
    orderBy() { return this; }
    limit(n: number) { this._limit = n; return this; }
    update(t: any) { this.kind = "update"; this.table = t.__table; return this; }
    set(v: any) { this._set = v; return this; }
    then(res: (v: any) => void, rej: (e: any) => void) { try { res(this._exec()); } catch (e) { rej(e); } }
    _exec() {
      const arr = store[this.table!];
      if (this.kind === "update") {
        const rows = arr.filter((r) => match(r, this.cond));
        rows.forEach((r) => Object.assign(r, this._set));
        return rows.map((r) => ({ ...r }));
      }
      let rows = arr.filter((r) => match(r, this.cond));
      if (this._limit !== null) rows = rows.slice(0, this._limit);
      if (this.cols) return rows.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries(this.cols)) o[k] = r[field(String(c))]; return o; });
      return rows.map((r) => ({ ...r }));
    }
  }
  const db = { select: (cols?: any) => new QB().select(cols), update: (t: any) => new QB().update(t) };
  return { store, reset, db, makeTable };
});

vi.mock("@workspace/db", () => ({
  db: H.db,
  generatedTasksTable: H.makeTable("generated_tasks"),
  clientVendorsTable: H.makeTable("client_vendors"),
  userClientVendorAccessTable: H.makeTable("user_client_vendor_access"),
  employeesTable: H.makeTable("employees"),
  insertTaskTemplateSchema: {}, updateTaskTemplateSchema: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: any) => ({ op: "eq", col, val }),
  and: (...conds: any[]) => ({ op: "and", conds }),
  inArray: (col: string, vals: any[]) => ({ op: "inArray", col, vals }),
  desc: (col: string) => ({ op: "desc", col }),
  sql: (() => ({ op: "sql" })) as any,
}));
vi.mock("../middleware/authz", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
// Stub out all ai-tasks services the router imports; only the association route is exercised.
vi.mock("../lib/ai-tasks/task-template.service", () => ({ listTemplates: vi.fn(), getTemplate: vi.fn(), createTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn() }));
vi.mock("../lib/ai-tasks/config.service", () => ({ isAiTasksEnabled: async () => true, getAiTasksConfig: vi.fn(), setAiTasksConfig: vi.fn() }));
vi.mock("../lib/ai-tasks/ai-task.service", () => ({ generateDailyTasks: vi.fn() }));
vi.mock("../lib/ai-tasks/task-approval.service", () => ({ approveTask: vi.fn(), rejectTask: vi.fn(), completeTask: vi.fn(), approveAll: vi.fn(), rejectAll: vi.fn(), regenerateTasks: vi.fn(), getTaskStats: vi.fn() }));
vi.mock("../lib/ai-tasks/employee-profile.service", () => ({ listEmployeesForGeneration: vi.fn(), updateEmployeeProfile: vi.fn(), syncEmployeesFromUsers: vi.fn() }));
vi.mock("../lib/ai-tasks/task-generation-job.service", () => ({ listJobs: vi.fn() }));
vi.mock("../lib/ai-tasks/ai-task-settings.service", () => ({ getCompanySettings: vi.fn(), updateCompanySettings: vi.fn(), listHolidays: vi.fn(), createHoliday: vi.fn(), deleteHoliday: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), deleteProject: vi.fn() }));
vi.mock("../lib/ai-tasks/analytics.service", () => ({ getAnalytics: vi.fn(), getHistoricalTrend: vi.fn() }));
vi.mock("../lib/ai-tasks/prompts.service", () => ({ getActivePrompt: vi.fn(), listPrompts: vi.fn(), createPromptVersion: vi.fn(), setActivePrompt: vi.fn() }));
vi.mock("../lib/ai-tasks/notification.service", () => ({ getUnreadAiTasksCount: vi.fn() }));

import aiTasksRouter from "./ai-tasks";

const ALPHA = 1, BETA = 2;
const STAFF = { id: 2, email: "a@x.com", role: "staff", companyIds: [ALPHA] };
const RESTRICTED = { id: 3, email: "v@x.com", role: "vendor_user", companyIds: [ALPHA] };
let currentUser: any = STAFF;

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.localUser = currentUser; req.log = { error: vi.fn() }; next(); });
app.use(aiTasksRouter);

beforeEach(() => {
  H.reset();
  currentUser = STAFF;
  H.store.generated_tasks.push({ id: 10, companyId: ALPHA, clientVendorId: null });
  H.store.client_vendors.push(
    { id: 1, companyId: ALPHA, name: "Acme", type: "client" },
    { id: 2, companyId: BETA, name: "Other", type: "vendor" },
  );
});

describe("PATCH /ai-tasks/:id/client-vendor", () => {
  it("links a task to a same-company client/vendor and clears with null", async () => {
    let res = await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: ALPHA, clientVendorId: 1 });
    expect(res.status).toBe(200);
    expect(H.store.generated_tasks[0].clientVendorId).toBe(1);
    res = await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: ALPHA, clientVendorId: null });
    expect(res.status).toBe(200);
    expect(H.store.generated_tasks[0].clientVendorId).toBeNull();
  });

  it("rejects a client/vendor from another company", async () => {
    currentUser = { ...STAFF, companyIds: [ALPHA, BETA] };
    const res = await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: ALPHA, clientVendorId: 2 });
    expect(res.status).toBe(400);
    expect(H.store.generated_tasks[0].clientVendorId).toBeNull();
  });

  it("403s a tampered companyId and 404s unknown tasks", async () => {
    expect((await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: BETA, clientVendorId: 1 })).status).toBe(403);
    expect((await request(app).patch("/ai-tasks/999/client-vendor").send({ companyId: ALPHA, clientVendorId: 1 })).status).toBe(404);
  });

  it("400s malformed ids instead of coercing them", async () => {
    expect((await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: ALPHA, clientVendorId: "1junk" })).status).toBe(400);
    expect((await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: ALPHA, clientVendorId: "1.9" })).status).toBe(400);
    expect((await request(app).patch("/ai-tasks/1junk/client-vendor").send({ companyId: ALPHA, clientVendorId: 1 })).status).toBe(403);
    expect(H.store.generated_tasks[0].clientVendorId).toBeNull();
  });

  it("404s a client/vendor outside the caller's row-level scope", async () => {
    currentUser = RESTRICTED; // vendor_user with no assignment rows → empty scope
    const res = await request(app).patch("/ai-tasks/10/client-vendor").send({ companyId: ALPHA, clientVendorId: 1 });
    expect(res.status).toBe(404);
    expect(H.store.generated_tasks[0].clientVendorId).toBeNull();
  });
});

describe("GET /ai-tasks/client-vendor-options", () => {
  it("returns active same-company records for unrestricted staff", async () => {
    H.store.client_vendors.push({ id: 3, companyId: ALPHA, name: "Inactive", type: "client", status: "inactive" });
    H.store.client_vendors[0].status = "active";
    const res = await request(app).get("/ai-tasks/client-vendor-options?companyId=1");
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual([1]);
  });

  it("row-restricted user only sees assigned records; empty scope sees none", async () => {
    H.store.client_vendors[0].status = "active";
    H.store.client_vendors.push({ id: 4, companyId: ALPHA, name: "Second", type: "vendor", status: "active" });
    currentUser = RESTRICTED;
    expect((await request(app).get("/ai-tasks/client-vendor-options?companyId=1")).body).toEqual([]);
    H.store.user_client_vendor_access.push({ id: 1, userId: RESTRICTED.id, clientVendorId: 4 });
    const res = await request(app).get("/ai-tasks/client-vendor-options?companyId=1");
    expect(res.body.map((r: any) => r.id)).toEqual([4]);
  });

  it("403s a tampered companyId", async () => {
    expect((await request(app).get("/ai-tasks/client-vendor-options?companyId=2")).status).toBe(403);
  });
});
