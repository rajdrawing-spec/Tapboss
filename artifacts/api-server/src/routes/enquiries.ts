import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, enquiriesTable } from "@workspace/db";
import { sendEnquiryNotificationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENQUIRY_TEAM_EMAIL = "info@tapashub.com";

// This endpoint is public (no session required) and writes to the database on
// every call, so it needs its own, much tighter ceiling than the general API
// limiter — a few genuine enquiries per visitor, not a spam vector.
const enquiryLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

// POST /api/enquiries — public contact-form submission from tapashub.com.
// Mounted before requireAuth: visitors are never signed in.
router.post("/enquiries", enquiryLimiter, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    // Honeypot: the frontend never sends this field filled in. A bot that
    // fills every input trips it; respond 200 without writing anything so
    // the bot doesn't learn to look for a different signal.
    if (typeof body.website === "string" && body.website.trim()) {
      res.status(201).json({ ok: true });
      return;
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    const company = typeof body.company === "string" ? body.company.trim() : undefined;
    const interest = typeof body.interest === "string" ? body.interest.trim() : undefined;
    const budget = typeof body.budget === "string" ? body.budget.trim() : undefined;

    if (!name || !email || !message) {
      res.status(400).json({ error: "Name, email and message are required." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    if (name.length > 200 || email.length > 320 || message.length > 5000) {
      res.status(400).json({ error: "One of the fields is too long." });
      return;
    }

    const [enquiry] = await db
      .insert(enquiriesTable)
      .values({ name, email, phone, company, interest, message, budget })
      .returning();

    // Best-effort: a delivery failure must never fail the submission itself —
    // the enquiry is already safely stored.
    sendEnquiryNotificationEmail({ to: ENQUIRY_TEAM_EMAIL, name, email, phone, company, interest, message, budget })
      .then((result) => {
        if (!result.ok) req.log?.warn({ error: result.error }, "Enquiry notification email failed");
      })
      .catch((err) => req.log?.warn({ err }, "Enquiry notification email threw"));

    res.status(201).json({ ok: true, id: enquiry?.id });
  } catch (e) {
    logger.error({ err: e }, "Failed to submit enquiry");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
