import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * POST /enquiries is the public tapashub.com contact-form endpoint — no
 * session required. Covers: validation, the honeypot silently dropping bot
 * submissions without writing a row, and a real submission reaching the DB
 * and triggering (but never failing on) the notification email.
 */

const H = vi.hoisted(() => {
  const inserted: any[] = [];
  const enquiriesTable = { __table: "enquiries" };
  const db = {
    insert: (_table: unknown) => ({
      values: (row: any) => ({
        returning: async () => {
          const saved = { id: inserted.length + 1, ...row };
          inserted.push(saved);
          return [saved];
        },
      }),
    }),
  };
  return { inserted, db, enquiriesTable };
});

vi.mock("@workspace/db", () => ({
  db: H.db,
  enquiriesTable: H.enquiriesTable,
}));

const sendEnquiryNotificationEmail = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../lib/email", () => ({ sendEnquiryNotificationEmail: (...args: any[]) => sendEnquiryNotificationEmail(...args) }));

import enquiriesRouter from "./enquiries";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).log = { error: () => {}, warn: () => {} }; next(); });
  app.use("/api", enquiriesRouter);
  return app;
}
const app = buildApp();

beforeEach(() => {
  H.inserted.length = 0;
  sendEnquiryNotificationEmail.mockClear();
});

describe("POST /api/enquiries", () => {
  it("rejects a submission missing required fields", async () => {
    const res = await request(app).post("/api/enquiries").send({ name: "Only Name" });
    expect(res.status).toBe(400);
    expect(H.inserted).toHaveLength(0);
  });

  it("rejects an invalid email address", async () => {
    const res = await request(app)
      .post("/api/enquiries")
      .send({ name: "Jane", email: "not-an-email", message: "Hello" });
    expect(res.status).toBe(400);
    expect(H.inserted).toHaveLength(0);
  });

  it("stores a valid enquiry and notifies the team by email", async () => {
    const res = await request(app).post("/api/enquiries").send({
      name: "Jane Doe",
      email: "jane@example.com",
      company: "Acme",
      interest: "Website",
      message: "We'd like to build a new storefront.",
      budget: "₹5–10 Lakh",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(H.inserted).toHaveLength(1);
    expect(H.inserted[0].email).toBe("jane@example.com");
    expect(sendEnquiryNotificationEmail).toHaveBeenCalledTimes(1);
    expect(sendEnquiryNotificationEmail.mock.calls[0][0]).toMatchObject({
      to: "info@tapashub.com",
      name: "Jane Doe",
      email: "jane@example.com",
    });
  });

  it("silently drops a submission where the honeypot field is filled in", async () => {
    const res = await request(app).post("/api/enquiries").send({
      name: "Bot",
      email: "bot@example.com",
      message: "spam",
      website: "https://spam.example.com",
    });
    expect(res.status).toBe(201);
    expect(H.inserted).toHaveLength(0);
    expect(sendEnquiryNotificationEmail).not.toHaveBeenCalled();
  });
});
