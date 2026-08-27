import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xq9WAAAAAElFTkSuQmCC";
const TEST_PNG_DATA_URL = `data:image/png;base64,${TEST_PNG_BASE64}`;

const mocks = vi.hoisted(() => ({
  analyzeProductImages: vi.fn(),
  exportProductsXlsx: vi.fn(),
  dbSelectResults: [] as unknown[][],
  dbTransaction: vi.fn(),
  dbInsertValues: [] as unknown[],
  storageUpload: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: vi.fn(() => {
        const result = mocks.dbSelectResults.shift() ?? [];
        const chain: any = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => Promise.resolve(result),
          then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
        };
        return chain;
      }),
      insert: vi.fn(() => ({
        values: async (value: unknown) => {
          mocks.dbInsertValues.push(value);
        },
      })),
      transaction: mocks.dbTransaction,
    },
  };
});

vi.mock("../middleware/authz", () => ({
  requirePermission: (permission: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.header("x-permission") !== permission) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  },
}));

vi.mock("../lib/company-scope", () => ({
  canAccessCompany: (req: express.Request, companyId: number) => req.header("x-company-id") === String(companyId),
  companyScope: (req: express.Request) => {
    const value = req.header("x-company-id");
    return value ? [Number(value)] : [];
  },
}));

vi.mock("../lib/features", () => ({ isAiProductsEnabled: () => true }));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    uploadPrivateObject = mocks.storageUpload;
    deletePrivateObject = mocks.storageDelete;
  },
}));
vi.mock("../lib/notify", () => ({ emitNotification: vi.fn() }));
vi.mock("../lib/product-ai.service", () => ({
  analyzeProductImages: mocks.analyzeProductImages,
  exportProductsXlsx: mocks.exportProductsXlsx,
  generateProductContent: vi.fn(),
  generateMarketplaceTemplate: vi.fn(),
  computeHealthScore: vi.fn(),
  saveAiMetadata: vi.fn(),
  generateBarcode: vi.fn(),
  ensureUniqueSku: vi.fn(),
  generateImageName: vi.fn(),
  resizeProductImage: vi.fn(),
  removeProductBackground: vi.fn(),
  generateBarcodeImage: vi.fn(),
  generateMarketplaceImages: vi.fn(),
  importProductsXlsx: vi.fn(),
}));

import inventoryRouter from "./inventory";
import aiProductsRouter from "./ai-products";

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req: any, _res, next) => {
    req.log = { error: vi.fn(), warn: vi.fn() };
    next();
  });
  instance.use(inventoryRouter);
  instance.use(aiProductsRouter);
  return instance;
}

describe("product catalog API hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbSelectResults.length = 0;
    mocks.dbInsertValues.length = 0;
    mocks.dbTransaction.mockImplementation(() => { throw new Error("Unexpected database access"); });
    mocks.storageUpload.mockResolvedValue("/objects/product-media/verified");
    mocks.storageDelete.mockResolvedValue(undefined);
  });

  it("requires inventory.view before listing products", async () => {
    const response = await request(app()).get("/products").set("x-company-id", "1");
    expect(response.status).toBe(403);
  });

  it("rejects a cross-company products query before database access", async () => {
    const response = await request(app())
      .get("/products?companyId=2")
      .set("x-company-id", "1")
      .set("x-permission", "inventory.view");
    expect(response.status).toBe(403);
  });

  it("rejects malformed product IDs and non-allowlisted patch fields", async () => {
    const malformed = await request(app())
      .patch("/products/1x")
      .set("x-permission", "inventory.manage")
      .send({ name: "Changed" });
    expect(malformed.status).toBe(400);

    const disallowed = await request(app())
      .patch("/products/1")
      .set("x-permission", "inventory.manage")
      .send({ id: 99 });
    expect(disallowed.status).toBe(400);
  });

  it("generates a SKU when a manual API creation leaves it blank", async () => {
    let inserted: any;
    const tx: any = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => {
        const chain: any = {
          from: () => chain,
          where: () => chain,
          limit: () => Promise.resolve([]),
        };
        return chain;
      }),
      insert: vi.fn(() => ({
        values: (value: any) => {
          inserted = value;
          return {
            returning: () => Promise.resolve([{
              id: 42,
              ...value,
              stockQuantity: value.stockQuantity ?? 0,
              reorderLevel: value.reorderLevel ?? 10,
              createdAt: new Date("2026-01-01T00:00:00Z"),
            }]),
          };
        },
      })),
    };
    mocks.dbTransaction.mockImplementation(async (callback: any) => callback(tx));
    mocks.dbSelectResults.push([{ name: "Acme" }]);

    const response = await request(app())
      .post("/products")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ companyId: 7, name: "Plain Shirt", category: "Apparel", sku: "", price: 100 });

    expect(response.status).toBe(201);
    expect(inserted.sku).toMatch(/^APP-PLAINSHI-[A-F0-9]{6}$/);
  });

  it("generates a new-product SKU without requiring a fake product ID", async () => {
    const service = await import("../lib/product-ai.service");
    vi.mocked(service.ensureUniqueSku).mockResolvedValue("APP-NEW-001");
    const response = await request(app())
      .post("/ai-products/generate-sku")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ companyId: 7, name: "New Shirt", category: "Apparel" });

    expect(response.status).toBe(200);
    expect(response.body.sku).toBe("APP-NEW-001");
  });

  it("rejects a cross-company primary image on manual product creation", async () => {
    mocks.dbSelectResults.push([{ id: 99 }]);
    const response = await request(app())
      .post("/products")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({
        companyId: 7,
        name: "Unsafe Image Product",
        category: "Apparel",
        sku: "UNSAFE-1",
        price: 100,
        imageUrl: "/objects/other-company-image",
      });

    expect(response.status).toBe(403);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });

  it("rejects a cross-company primary image on product update", async () => {
    mocks.dbSelectResults.push([{ id: 5, companyId: 7 }], [{ id: 99 }]);
    const response = await request(app())
      .patch("/products/5")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ imageUrl: "/objects/other-company-image" });

    expect(response.status).toBe(403);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });

  it("rejects a primary inline image whose bytes are not a valid image", async () => {
    const response = await request(app())
      .post("/products")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({
        companyId: 7,
        name: "Invalid Inline Image",
        category: "Apparel",
        sku: "INVALID-IMAGE",
        price: 100,
        imageUrl: "data:image/png;base64,YWJj",
      });

    expect(response.status).toBe(403);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });

  it("rejects uploaded image bytes that do not match the claimed MIME type", async () => {
    const response = await request(app())
      .post("/products/media/upload?companyId=7")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .set("content-type", "image/jpeg")
      .send(Buffer.from(TEST_PNG_BASE64, "base64"));

    expect(response.status).toBe(415);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(mocks.dbInsertValues).toHaveLength(0);
  });

  it("rejects product media bodies over 8 MB before storage or ownership writes", async () => {
    const response = await request(app())
      .post("/products/media/upload?companyId=7")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .set("content-type", "image/png")
      .send(Buffer.alloc(8 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(mocks.dbInsertValues).toHaveLength(0);
  });

  it("claims product media only after verified bytes are stored", async () => {
    const image = Buffer.from(TEST_PNG_BASE64, "base64");
    const response = await request(app())
      .post("/products/media/upload?companyId=7")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .set("content-type", "image/png")
      .send(image);

    expect(response.status).toBe(201);
    expect(mocks.storageUpload).toHaveBeenCalledWith(image, "image/png", "product-media");
    expect(mocks.dbInsertValues).toEqual([
      { companyId: 7, objectPath: "/objects/product-media/verified" },
    ]);
  });

  it("analyzes a 1-10 image draft without touching product persistence", async () => {
    mocks.analyzeProductImages.mockResolvedValue({
      suggestedName: "Blue Shirt", category: "Apparel", subcategory: "Shirts",
      attributes: { Color: "Blue" }, keywords: [], seoTags: [], tags: [],
      quality: {}, marketplaceReady: true, suggestions: [],
    });
    const response = await request(app())
      .post("/ai-products/analyze-draft")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ companyId: 7, images: [TEST_PNG_DATA_URL] });
    expect(response.status).toBe(200);
    expect(response.body.autoFill).toMatchObject({ name: "Blue Shirt", color: "Blue" });
    expect(mocks.analyzeProductImages).toHaveBeenCalledWith([TEST_PNG_DATA_URL]);
  });

  it("returns a clear retryable response when the vision model is temporarily overloaded", async () => {
    mocks.analyzeProductImages.mockRejectedValueOnce(
      Object.assign(new Error("This model is currently experiencing high demand"), { status: 503 }),
    );

    const response = await request(app())
      .post("/ai-products/analyze-draft")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ companyId: 7, images: [TEST_PNG_DATA_URL] });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain("temporarily busy");
    expect(mocks.dbInsertValues).toHaveLength(0);
  });

  it("rejects oversized draft image groups", async () => {
    const response = await request(app())
      .post("/ai-products/analyze-draft")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ companyId: 7, images: Array.from({ length: 11 }, () => TEST_PNG_DATA_URL) });
    expect(response.status).toBe(400);
    expect(mocks.analyzeProductImages).not.toHaveBeenCalled();
  });

  it("rejects an unclaimed object path before product image analysis", async () => {
    mocks.dbSelectResults.push(
      [{ companyId: 7, name: "Shirt", brand: null, category: "Apparel", subcategory: null, weight: null, dimensions: null }],
      [],
      [],
      [],
    );
    const response = await request(app())
      .post("/ai-products/5/analyze-images")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ objectPaths: ["/objects/not-claimed-by-company"] });

    expect(response.status).toBe(403);
    expect(mocks.analyzeProductImages).not.toHaveBeenCalled();
  });

  it("rejects a product image path already associated with another company", async () => {
    mocks.dbSelectResults.push(
      [{ companyId: 7 }],
      [{ id: 99 }],
    );
    const response = await request(app())
      .post("/products/5/images")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ objectPath: "/objects/other-company-image", isPrimary: true, sortOrder: 0 });

    expect(response.status).toBe(403);
  });

  it("keeps the legacy quick-create route review-only", async () => {
    mocks.analyzeProductImages.mockResolvedValue({
      suggestedName: "Review Me",
      category: "Apparel",
      subcategory: "Shirts",
      attributes: { Brand: "Tapas" },
      keywords: ["shirt"],
      seoTags: ["apparel"],
      tags: [],
      quality: {},
      marketplaceReady: true,
      suggestions: [],
    });
    const response = await request(app())
      .post("/ai-products/quick-create")
      .set("x-company-id", "7")
      .set("x-permission", "inventory.manage")
      .send({ companyId: 7, images: [TEST_PNG_DATA_URL] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ saved: false, product: null });
    expect(response.body.autoFill.name).toBe("Review Me");
  });

  it("passes selected product IDs to the company-scoped workbook exporter", async () => {
    mocks.exportProductsXlsx.mockResolvedValue(Buffer.from("xlsx"));
    const response = await request(app())
      .post("/ai-products/export-xlsx")
      .set("x-company-id", "3")
      .set("x-permission", "inventory.view")
      .send({ companyId: 3, productIds: [9, 4] });
    expect(response.status).toBe(200);
    expect(mocks.exportProductsXlsx).toHaveBeenCalledWith(3, [9, 4]);
  });
});