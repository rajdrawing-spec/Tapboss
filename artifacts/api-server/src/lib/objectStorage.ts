/**
 * Portable private file storage for self-hosted deployments.
 *
 * Files live outside the release directory and are addressed through the
 * existing /objects/... paths stored in the database. Set OBJECT_STORAGE_DIR
 * to a persistent absolute directory on the server (for example
 * /home/tapaboss/data/objects). PUBLIC_OBJECT_DIR is optional and is used for
 * the legacy public-asset route.
 */

import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, normalize, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const legacyObjectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface LocalObjectMetadata {
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
}

export class LocalObjectFile {
  constructor(
    public readonly name: string,
    private readonly filePath: string,
    private readonly metadataPath: string,
  ) {}

  async exists(): Promise<[boolean]> {
    try {
      await stat(this.filePath);
      return [true];
    } catch {
      return [false];
    }
  }

  async getMetadata(): Promise<[LocalObjectMetadata]> {
    try {
      const info = await stat(this.filePath);
      let custom: Record<string, string> | undefined;
      try {
        custom = JSON.parse(await readFile(this.metadataPath, "utf8"));
      } catch {
        // Metadata is optional for local files.
      }
      return [{ size: info.size, contentType: custom?.contentType, metadata: custom }];
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  createReadStream(): NodeJS.ReadableStream {
    return createReadStream(this.filePath);
  }

  async download(): Promise<[Buffer]> {
    try {
      return [await readFile(this.filePath)];
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  async save(buffer: Buffer, options: { contentType?: string } = {}): Promise<void> {
    await mkdir(resolve(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, buffer, { flag: "wx" });
    await writeFile(this.metadataPath, JSON.stringify({ contentType: options.contentType }), { flag: "w" });
  }

  async delete(): Promise<void> {
    try {
      await rm(this.filePath, { force: false });
      await rm(this.metadataPath, { force: true });
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new ObjectNotFoundError();
      throw error;
    }
  }
}

function configuredDir(name: "OBJECT_STORAGE_DIR" | "PUBLIC_OBJECT_DIR", fallback: string): string {
  const configured = process.env[name]?.trim();
  const dir = configured || fallback;
  if (!dir) throw new Error(`${name} must be set to a persistent directory`);
  return resolve(dir);
}

function assertSafeObjectName(objectName: string): string {
  const clean = objectName.replace(/^\/+/, "");
  if (!clean || clean.includes("\0")) throw new ObjectNotFoundError();
  const normalized = normalize(clean);
  if (normalized === ".." || normalized.startsWith(`..${"/"}`) || normalized.includes(`${"/"}..${"/"}`)) {
    throw new ObjectNotFoundError();
  }
  return normalized;
}

function objectFileAt(root: string, objectName: string): LocalObjectFile {
  const safeName = assertSafeObjectName(objectName);
  const filePath = resolve(root, safeName);
  const rel = relative(root, filePath);
  if (!rel || rel.startsWith("..") || resolve(root, rel) !== filePath) throw new ObjectNotFoundError();
  return new LocalObjectFile(`/objects/${safeName}`, filePath, `${filePath}.meta.json`);
}

type StoredObjectFile = LocalObjectFile | File;

function parseCloudPath(value: string): { bucketName: string; objectName: string } {
  const pathValue = value.startsWith("/") ? value.slice(1) : value;
  const slash = pathValue.indexOf("/");
  if (slash <= 0 || slash === pathValue.length - 1) throw new ObjectNotFoundError();
  return { bucketName: pathValue.slice(0, slash), objectName: pathValue.slice(slash + 1) };
}

function legacyMode(): boolean {
  return !process.env.OBJECT_STORAGE_DIR?.trim() && Boolean(process.env.PRIVATE_OBJECT_DIR?.trim());
}

function legacyEntityRoot(): string {
  const root = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!root) throw new Error("PRIVATE_OBJECT_DIR is required for legacy Replit object storage");
  return root.replace(/\/$/, "");
}

async function responseFromFile(file: StoredObjectFile, cacheTtlSec = 3600): Promise<Response> {
  const [metadata] = await file.getMetadata();
  const stream = file.createReadStream();
  const headers: Record<string, string> = {
    "Content-Type": metadata.contentType || "application/octet-stream",
    "Cache-Control": `private, max-age=${cacheTtlSec}`,
  };
  if (metadata.size !== undefined) headers["Content-Length"] = String(metadata.size);
  return new Response(Readable.toWeb(stream as Readable) as ReadableStream, { headers });
}

export class ObjectStorageService {
  private privateDir(): string {
    return configuredDir("OBJECT_STORAGE_DIR", join(process.cwd(), "data", "objects"));
  }

  private publicDir(): string {
    return configuredDir("PUBLIC_OBJECT_DIR", join(process.cwd(), "data", "public"));
  }

  getPublicObjectSearchPaths(): string[] {
    return [this.publicDir()];
  }

  getPrivateObjectDir(): string {
    return legacyMode() ? legacyEntityRoot() : this.privateDir();
  }

  async searchPublicObject(filePath: string): Promise<StoredObjectFile | null> {
    if (legacyMode()) {
      const roots = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map((v) => v.trim()).filter(Boolean);
      for (const root of roots) {
        const { bucketName, objectName } = parseCloudPath(`${root.replace(/\/$/, "")}/${assertSafeObjectName(filePath)}`);
        const file = legacyObjectStorageClient.bucket(bucketName).file(objectName);
        if ((await file.exists())[0]) return file;
      }
      return null;
    }
    try {
      const file = objectFileAt(this.publicDir(), filePath);
      return (await file.exists())[0] ? file : null;
    } catch {
      return null;
    }
  }

  async downloadObject(file: StoredObjectFile, cacheTtlSec = 3600): Promise<Response> {
    return responseFromFile(file, cacheTtlSec);
  }

  /**
   * Kept for API compatibility. Self-hosted uploads use the server-side
   * product-media endpoint; this returns an address only for legacy callers.
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = `uploads/${randomUUID()}`;
    if (!legacyMode()) await mkdir(join(this.privateDir(), "uploads"), { recursive: true });
    return `/objects/${objectId}`;
  }

  async uploadPrivateObject(buffer: Buffer, contentType: string, prefix = "uploads"): Promise<string> {
    const entityId = `${assertSafeObjectName(prefix)}/${randomUUID()}`;
    const objectPath = `/objects/${entityId}`;
    await this.saveObjectAtPath(objectPath, buffer, contentType);
    return objectPath;
  }

  async saveObjectAtPath(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    if (legacyMode()) {
      const { bucketName, objectName } = parseCloudPath(
        `${legacyEntityRoot()}/${assertSafeObjectName(objectPath.slice("/objects/".length))}`,
      );
      await legacyObjectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
        contentType,
        resumable: false,
      });
      return;
    }
    const file = objectFileAt(this.privateDir(), objectPath.slice("/objects/".length));
    await file.save(buffer, { contentType });
  }

  async deletePrivateObject(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
    await file.delete();
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObjectFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    if (legacyMode()) {
      const { bucketName, objectName } = parseCloudPath(
        `${legacyEntityRoot()}/${assertSafeObjectName(objectPath.slice("/objects/".length))}`,
      );
      const file = legacyObjectStorageClient.bucket(bucketName).file(objectName);
      if (!(await file.exists())[0]) throw new ObjectNotFoundError();
      return file;
    }
    const file = objectFileAt(this.privateDir(), objectPath.slice("/objects/".length));
    if (!(await file.exists())[0]) throw new ObjectNotFoundError();
    return file;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("https://storage.googleapis.com/")) {
      const url = new URL(rawPath);
      const cloudPath = url.pathname.replace(/^\//, "");
      const root = process.env.PRIVATE_OBJECT_DIR?.trim()?.replace(/^\/|\/$/g, "");
      if (root && cloudPath.startsWith(`${root}/`)) {
        return `/objects/${cloudPath.slice(root.length + 1)}`;
      }
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return false;
  }
}