---
name: Clients & Vendors directory + row-level access
description: Design rules for the unified client_vendors module, row-level scoping, and vendor_user role
---

- Unified `client_vendors` table (type client|vendor) is separate from legacy `customers`/`vendors`; row-level restriction via `user_client_vendor_access` (no rows = unrestricted for internal users).
- `clientVendorScope(req)` mirrors companyScope semantics (null=unrestricted, array=only those ids, cached on req). **Exception: vendor_user role with no rows resolves to `[]` (deny-by-default)** — external roles must never default open.
- **Why:** an architect review found the initial "no rows = see everything" default let unconfigured vendor users see all company documents/tasks.
- **How to apply:** any new resource gaining a `clientVendorId` column must apply cvScope on list AND stats/aggregates AND mutation paths (PATCH/DELETE guard the *existing* association, not just a replacement one). Row-restricted users can't create or delete client_vendors.
- Cross-table validation: incoming clientVendorId must belong to the same company as the parent record; supplied employeeId must be re-validated against the company.
- Express 5: regex route params (`:id(\\d+)`) unsupported; `parseInt(String(req.params.x))` needed for TS (params typed string|string[]).
- Fake-DB test suites break with 500s when a route starts using a new table or `requirePermission` (roles-table query); add the table to the mock and stub ../middleware/authz pass-through.
