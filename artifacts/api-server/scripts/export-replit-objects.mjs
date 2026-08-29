#!/usr/bin/env node
/**
 * One-time Replit Object Storage export for a Hostinger cutover.
 *
 * Run this inside the original Replit workspace while the object-storage
 * sidecar and PRIVATE_OBJECT_DIR are still available. The output preserves the
 * existing /objects/<relative-path> layout, so no rewrite is needed for normal
 * object paths. With --rewrite-db, legacy storage.googleapis.com values in text
 * and jsonb columns are converted to /objects/... after every object exports.
 */
import { Storage } from "@google-cloud/storage";
import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const SIDECAR = "http://127.0.0.1:1106";

function usage() {
  console.log("Usage: pnpm --filter @workspace/api-server run export:replit-objects -- <output-dir> [--rewrite-db]");
}

function parseRoot(value) {
  const clean = value.trim().replace(/^\/|\/$/g, "");
  const slash = clean.indexOf("/");
  if (slash <= 0) throw new Error(`Invalid object-storage root: ${value}`);
  return { bucket: clean.slice(0, slash), prefix: `${clean.slice(slash + 1).replace(/\/$/, "")}/` };
}

function safeRelative(name, prefix) {
  const relative = name.slice(prefix.length);
  const normalized = path.posix.normalize(relative);
  if (!relative || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe object name: ${name}`);
  }
  return normalized;
}

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const [outputArg, ...flags] = cliArgs;
if (!outputArg || outputArg === "--help") {
  usage();
  process.exit(outputArg ? 0 : 1);
}

const privateRootRaw = process.env.PRIVATE_OBJECT_DIR?.trim();
if (!privateRootRaw) throw new Error("PRIVATE_OBJECT_DIR is not available; run this in the original Replit workspace");
const privateRoot = parseRoot(privateRootRaw);
const publicRoots = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map((v) => v.trim()).filter(Boolean).map(parseRoot);
const outputDir = path.resolve(outputArg);

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function exportRoot(root, targetName) {
  const [files] = await storage.bucket(root.bucket).getFiles({ prefix: root.prefix });
  let bytes = 0;
  const exported = [];
  for (const file of files) {
    const relative = safeRelative(file.name, root.prefix);
    const destination = path.join(outputDir, targetName, ...relative.split("/"));
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer, { flag: "wx" });
    await writeFile(`${destination}.meta.json`, JSON.stringify({ contentType: metadata.contentType || "application/octet-stream" }));
    bytes += buffer.length;
    exported.push({
      target: targetName,
      path: relative,
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }
  return { count: files.length, bytes, exported };
}

await mkdir(outputDir, { recursive: true });
const privateResult = await exportRoot(privateRoot, "objects");
let publicCount = 0;
let publicBytes = 0;
const exportedFiles = [...privateResult.exported];
for (const root of publicRoots) {
  const result = await exportRoot(root, "public");
  publicCount += result.count;
  publicBytes += result.bytes;
  exportedFiles.push(...result.exported);
}

let rewrittenRows = 0;
if (flags.includes("--rewrite-db")) {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL or SUPABASE_DB_URL is required for --rewrite-db");
  const pool = new pg.Pool({ connectionString, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false }, max: 1 });
  const legacyPrefix = `https://storage.googleapis.com/${privateRoot.bucket}/${privateRoot.prefix}`;
  try {
    await pool.query("BEGIN");
    const { rows } = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb')
    `);
    for (const row of rows) {
      const table = `"${String(row.table_name).replaceAll('"', '""')}"`;
      const column = `"${String(row.column_name).replaceAll('"', '""')}"`;
      const result = row.data_type === "jsonb"
        ? await pool.query(`UPDATE ${table} SET ${column} = replace(${column}::text, $1, '/objects/')::jsonb WHERE ${column}::text LIKE '%' || $1 || '%'`, [legacyPrefix])
        : await pool.query(`UPDATE ${table} SET ${column} = '/objects/' || substring(${column} FROM $2) WHERE ${column} LIKE $1 || '%'`, [legacyPrefix, legacyPrefix.length + 1]);
      rewrittenRows += result.rowCount || 0;
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

const manifest = {
  exportedAt: new Date().toISOString(),
  privateObjects: privateResult.count,
  privateBytes: privateResult.bytes,
  publicObjects: publicCount,
  publicBytes,
  rewrittenRows,
  files: exportedFiles,
};
await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));