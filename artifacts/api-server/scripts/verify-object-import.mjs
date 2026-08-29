#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const source = cliArgs[0];
if (!source || source === "--help") {
  console.log("Usage: node scripts/verify-object-import.mjs <export-dir>");
  process.exit(source ? 0 : 1);
}

const root = path.resolve(source);
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
let checked = 0;
for (const entry of manifest.files || []) {
  const filePath = path.resolve(root, entry.target, ...String(entry.path).split("/"));
  const expectedRoot = path.resolve(root, entry.target);
  if (!filePath.startsWith(`${expectedRoot}${path.sep}`)) throw new Error(`Unsafe manifest path: ${entry.path}`);
  const buffer = await readFile(filePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (buffer.length !== entry.bytes || sha256 !== entry.sha256) {
    throw new Error(`Object verification failed: ${entry.target}/${entry.path}`);
  }
  checked += 1;
}
if (checked !== Number(manifest.privateObjects || 0) + Number(manifest.publicObjects || 0)) {
  throw new Error(`Manifest count mismatch: verified ${checked}`);
}
console.log(`Verified ${checked} exported objects`);