---
name: XLSX image-link cell limits
description: Why catalog exports must not put inline image data into spreadsheet cells.
---

Workbook cells must never contain base64 or `data:` image URLs. Export only linkable image paths/URLs, and cap other text values at Excel's 32,767-character cell limit.

**Why:** Excel rejects cell text longer than 32,767 characters; inline image payloads routinely exceed that limit.

**How to apply:** Spreadsheet exports with images should normalize stored object paths into accessible URLs and omit inline image payloads.