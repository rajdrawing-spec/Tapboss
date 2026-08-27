import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: {} };
});

vi.mock("./ai-provider", () => ({
  getActiveProvider: vi.fn(),
  geminiProvider: {},
  getConfig: vi.fn(),
}));

vi.mock("./objectStorage", () => ({
  ObjectStorageService: class {},
}));

import {
  createProductCatalogWorkbook,
  PRODUCT_CATALOG_EXPORT_HEADERS,
} from "./product-ai.service";

describe("professional product catalog workbook", () => {
  it("keeps the exact 45-column reference order and maps the main image first", () => {
    const now = new Date("2026-08-27T00:00:00Z");
    const buffer = createProductCatalogWorkbook(
      [{
        id: 42,
        companyId: 7,
        name: "Linen Shirt",
        sku: "LIN-001",
        barcode: "PRD001",
        category: "Apparel",
        subcategory: "Shirts",
        description: "Breathable linen shirt",
        shortDescription: null,
        price: 999,
        mrp: 1299,
        costPrice: 500,
        gst: 5,
        brand: "Tapas",
        weight: "250 g",
        dimensions: "30 x 20 x 5 cm",
        hsn: "6205",
        stockQuantity: 12,
        reorderLevel: 3,
        warehouseLocation: "PICKUP-1",
        imageUrl: "/objects/legacy",
        sourceLink: null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }],
      [
        { id: 2, productId: 42, companyId: 7, objectPath: "/objects/back", isPrimary: false, sortOrder: 1, altText: null, aiTags: [], createdAt: now },
        { id: 1, productId: 42, companyId: 7, objectPath: "/objects/front", isPrimary: true, sortOrder: 0, altText: null, aiTags: [], createdAt: now },
      ],
      [{
        id: 1,
        productId: 42,
        companyId: 7,
        seoTitle: null,
        seoDescription: null,
        keywords: [],
        seoTags: ["Summer", "Menswear", "Linen"],
        attributes: { Color: "Blue", Size: "M", Material: "Linen" },
        healthScore: 90,
        aiAnalysis: {},
        createdAt: now,
        updatedAt: now,
      }],
    );

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets.Products;
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);

    expect(PRODUCT_CATALOG_EXPORT_HEADERS).toHaveLength(46);
    expect(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]).toEqual(PRODUCT_CATALOG_EXPORT_HEADERS);
    expect(rows[0]).toMatchObject({
      "Product Image Preview": "/api/storage/objects/legacy",
      "Product Code": "PRD001",
      "Name": "Linen Shirt",
      "Sku Id": "LIN-001",
      "Image 1": "/api/storage/objects/legacy",
      "Image 2": "/api/storage/objects/front",
      "Image 3": "/api/storage/objects/back",
      "Packaging Length (in cm)": "30",
      "Packaging Breadth (in cm)": "20",
      "Packaging Height (in cm)": "5",
      "Packaging Weight (in kg)": 0.25,
      "Colour": "Blue",
      "collection_1": "Summer",
    });
    expect(sheet["!autofilter"]?.ref).toBe("A1:AT2");
  });
});