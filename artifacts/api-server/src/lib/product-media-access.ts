import {
  db,
  productsTable,
  productImagesTable,
  productMediaUploadsTable,
} from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import sharp from "sharp";

const INLINE_IMAGE = /^data:image\/[a-zA-Z0-9+.-]+;base64,/;
export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Map([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

export function isSupportedProductImagePath(value: string) {
  return value.startsWith("/objects/") || INLINE_IMAGE.test(value);
}

export async function validateProductImageBuffer(buffer: Buffer, claimedMime?: string) {
  if (!buffer.length || buffer.length > MAX_PRODUCT_IMAGE_BYTES) return null;
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 25_000_000 }).metadata();
    const mime = metadata.format ? ALLOWED_FORMATS.get(metadata.format) : undefined;
    if (!mime || (claimedMime && claimedMime !== mime)) return null;
    return mime;
  } catch {
    return null;
  }
}

async function validateInlineImage(value: string) {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) return false;
  const buffer = Buffer.from(match[2], "base64");
  return Boolean(await validateProductImageBuffer(buffer, match[1].toLowerCase()));
}

export async function imagePathUsedByAnotherCompany(objectPath: string, companyId: number) {
  if (!objectPath.startsWith("/objects/")) return false;
  const [image] = await db.select({ id: productImagesTable.id }).from(productImagesTable).where(and(
    eq(productImagesTable.objectPath, objectPath),
    ne(productImagesTable.companyId, companyId),
  )).limit(1);
  if (image) return true;
  const [legacyProduct] = await db.select({ id: productsTable.id }).from(productsTable).where(and(
    eq(productsTable.imageUrl, objectPath),
    ne(productsTable.companyId, companyId),
  )).limit(1);
  return Boolean(legacyProduct);
}

export async function isProductImageOwnedByCompany(objectPath: string, companyId: number) {
  if (INLINE_IMAGE.test(objectPath)) return validateInlineImage(objectPath);
  if (!objectPath.startsWith("/objects/")) return false;
  const [upload] = await db.select({ id: productMediaUploadsTable.id }).from(productMediaUploadsTable).where(and(
    eq(productMediaUploadsTable.objectPath, objectPath),
    eq(productMediaUploadsTable.companyId, companyId),
  )).limit(1);
  if (upload) return true;
  const [image] = await db.select({ id: productImagesTable.id }).from(productImagesTable).where(and(
    eq(productImagesTable.objectPath, objectPath),
    eq(productImagesTable.companyId, companyId),
  )).limit(1);
  if (image) return true;
  const [legacyProduct] = await db.select({ id: productsTable.id }).from(productsTable).where(and(
    eq(productsTable.imageUrl, objectPath),
    eq(productsTable.companyId, companyId),
  )).limit(1);
  return Boolean(legacyProduct);
}

export async function canAssociateProductImage(objectPath: string, companyId: number) {
  if (!isSupportedProductImagePath(objectPath)) return false;
  if (await imagePathUsedByAnotherCompany(objectPath, companyId)) return false;
  return isProductImageOwnedByCompany(objectPath, companyId);
}