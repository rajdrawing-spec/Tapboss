import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk Frontend API proxy — must be mounted BEFORE body parsers.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.APP_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed"));
  },
  credentials: true,
}));
// SESSION_SECRET is guaranteed present (checked in index.ts)
app.use(cookieParser(process.env["SESSION_SECRET"]));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Resolve the publishable key from the request host so the same server can
// serve multiple Clerk custom domains; falls back to CLERK_PUBLISHABLE_KEY.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// In a Hostinger deployment the API process can serve the Vite build directly,
// allowing Nginx/Apache to proxy one origin without a second Node process.
const webDistCandidates = [
  process.env.WEB_DIST_DIR,
  path.join(process.cwd(), "artifacts", "tapashub", "dist", "public"),
  path.join(process.cwd(), "..", "tapashub", "dist", "public"),
].filter((value): value is string => Boolean(value));
const webDist = webDistCandidates.map((value) => path.resolve(value)).find(existsSync);
if (webDist) {
  app.use(express.static(webDist, { index: false, maxAge: "1y" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || path.extname(req.path)) {
      next();
      return;
    }
    res.sendFile(path.join(webDist, "index.html"), (error) => {
      if (error && !res.headersSent) next(error);
    });
  });
}

export default app;
