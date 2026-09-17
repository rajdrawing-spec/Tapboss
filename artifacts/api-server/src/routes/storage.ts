import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, raw, type IRouter, type Request, type Response } from 'express';
import { db, documentsTable, productImagesTable, productMediaUploadsTable, productsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { canAccessCompany } from '../lib/company-scope';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Resolves which company (if any) a private object belongs to, by checking
 * the tables known to reference `/objects/...` paths with a companyId. Only
 * covers documents and product images today — chat attachments and
 * marketing-project creatives aren't tracked here yet, so those objects fall
 * through as unassociated (see the null case below).
 *
 * Returns null when no owning record is found — most commonly a legacy or
 * global (company-less) row — in which case the caller does not restrict
 * access, matching the route's previous unconditional-serve behavior for
 * anything outside the categories this function knows about.
 */
async function resolveObjectCompanyId(objectPath: string): Promise<number | null> {
  const [doc] = await db.select({ companyId: documentsTable.companyId }).from(documentsTable).where(eq(documentsTable.fileUrl, objectPath)).limit(1);
  if (doc?.companyId != null) return doc.companyId;

  const [upload] = await db.select({ companyId: productMediaUploadsTable.companyId }).from(productMediaUploadsTable).where(eq(productMediaUploadsTable.objectPath, objectPath)).limit(1);
  if (upload) return upload.companyId;

  const [image] = await db.select({ companyId: productImagesTable.companyId }).from(productImagesTable).where(eq(productImagesTable.objectPath, objectPath)).limit(1);
  if (image) return image.companyId;

  const [legacyProduct] = await db.select({ companyId: productsTable.companyId }).from(productsTable).where(eq(productsTable.imageUrl, objectPath)).limit(1);
  if (legacyProduct) return legacyProduct.companyId;

  return null;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Available to any authenticated staff member: uploads cover company logos
 * (admins) as well as document attachments managed by regular users.
 * Global requireAuth already runs before this router is mounted.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          // Self-hosted deployments receive a same-origin PUT endpoint. This
          // keeps file bytes on the API server and works without a storage
          // sidecar or browser CORS configuration.
          uploadURL: `/api/storage/uploads/put/${objectPath.slice('/objects/'.length)}`,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

router.put(
  '/storage/uploads/put/*uploadId',
  raw({ type: () => true, limit: '50mb' }),
  async (req: Request, res: Response) => {
    const rawId = req.params.uploadId;
    const uploadId = Array.isArray(rawId) ? rawId.join('/') : rawId;
    if (!uploadId || uploadId.includes('..') || uploadId.includes('\0')) {
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }
    try {
      const objectPath = `/objects/${uploadId}`;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      await objectStorageService.saveObjectAtPath(
        objectPath,
        body,
        String(req.headers['content-type'] || 'application/octet-stream').split(';')[0],
      );
      res.status(204).end();
    } catch (error) {
      req.log.error({ err: error }, 'Error storing uploaded object');
      res.status(500).json({ error: 'Failed to store uploaded object' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Global requireAuth already runs before this router is mounted, so the
    // caller is a signed-in user — but that's not enough on its own: without
    // this check, any authenticated user who obtained another company's
    // object path (a leaked link, a shared screenshot) could fetch it
    // directly, bypassing that company's scope entirely.
    const ownerCompanyId = await resolveObjectCompanyId(objectPath);
    if (ownerCompanyId != null && !canAccessCompany(req, ownerCompanyId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
