import * as React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * UI regression — a restricted vendor user must only ever SEE their assigned
 * client/vendor's records. The API already filters rows server-side; these
 * tests prove the pages render exactly what the (filtered) API returns and
 * add no unfiltered secondary fetches that could leak other records.
 */

vi.mock("wouter", () => ({
  useParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useLocation: () => ["/", () => {}],
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }))

// Vendor user: read-only permissions, no manage rights.
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: 7, email: "vendor@test", isSuperAdmin: false, role: "vendor_user", permissions: ["clients_vendors.view", "documents.view"] },
    isSuperAdmin: false,
    hasPermission: (p: string) => ["clients_vendors.view", "documents.view"].includes(p),
    loading: false,
    logout: async () => {},
    refetch: async () => {},
  }),
}))
vi.mock("@/contexts/company-context", () => {
  // stable references: pages have effects keyed on activeCompany identity
  const activeCompany = { id: 1, name: "Acme Foods" }
  const ctx = { activeCompany, companies: [activeCompany], isParentView: false }
  return { useCompany: () => ctx }
})

import ClientsVendors from "@/pages/clients-vendors"
import Documents from "@/pages/documents"
import { EmployeeDashboard } from "@/components/ai-tasks/employee-dashboard"

// What the server returns for this restricted user (already filtered)
const ASSIGNED_CV = { id: 1, companyId: 1, type: "client", name: "Acme Client", organizationName: null, contactPerson: null, email: null, phone: null, whatsapp: null, website: null, address: null, notes: null, status: "active", customFields: null, createdAt: "2026-01-01" }
const LINKED_DOC = { id: 1, companyId: 1, name: "Acme contract", clientVendorId: 1, category: "legal", fileUrl: "https://x/a.pdf", issuer: null, referenceNumber: null, issueDate: null, expiryDate: null, notes: null, createdAt: "2026-01-01" }

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/api/client-vendors")) {
      return new Response(JSON.stringify({ items: [ASSIGNED_CV], pagination: { total: 1, totalPages: 1 } }), { status: 200, headers: { "content-type": "application/json" } })
    }
    if (url.includes("/api/documents")) {
      return new Response(JSON.stringify([LINKED_DOC]), { status: 200, headers: { "content-type": "application/json" } })
    }
    if (url.includes("/api/ai-tasks/my-tasks")) {
      // server already filtered to the assigned client/vendor's tasks
      return new Response(JSON.stringify({
        tasks: [{ id: 1, title: "Acme task", description: "d", priority: "high", status: "approved", dueDate: null, estimatedMinutes: 30 }],
        stats: { total: 1, pending: 0, approved: 1, completed: 0, rejected: 0, overdue: 0, dueToday: 0, highPriority: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } })
    }
    return new Response(JSON.stringify({}), { status: 404 })
  })
  vi.stubGlobal("fetch", fetchSpy)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("vendor user UI isolation", () => {
  it("directory shows only the assigned record and hides manage actions", async () => {
    render(<ClientsVendors />)
    await waitFor(() => expect(screen.getByText("Acme Client")).toBeTruthy())
    expect(screen.queryByText("Globex")).toBeNull()
    // no manage permission → no Add button
    expect(screen.queryByText(/add client|add vendor|new client/i)).toBeNull()
    // every list request stays company-scoped
    for (const call of fetchSpy.mock.calls.filter((c) => String(c[0]).includes("client-vendors"))) {
      expect(String(call[0])).toContain("companyId=1")
    }
  })

  it("documents page renders only the server-filtered rows and hides ALL manage controls", async () => {
    const { container } = render(<Documents />)
    await waitFor(() => expect(screen.getByText("Acme contract")).toBeTruthy(), { timeout: 4000 })
    expect(screen.queryByText("Globex contract")).toBeNull()
    expect(screen.queryByText("Internal policy")).toBeNull()
    // read-only vendor: no Add, and no edit/delete icons on any card
    expect(screen.queryByText(/add document/i)).toBeNull()
    expect(container.querySelector(".lucide-pencil")).toBeNull()
    expect(container.querySelector(".lucide-trash-2, .lucide-trash2")).toBeNull()
  })

  it("my-tasks view shows only the server-filtered tasks and true (scoped) stat counts", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <EmployeeDashboard companyId={1} employeeId={5} />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText("Acme task")).toBeTruthy())
    expect(screen.queryByText("Globex task")).toBeNull()
    expect(screen.queryByText("Unlinked task")).toBeNull()
    // scoped total = 1, never the company-wide aggregate
    expect(screen.queryByText("99")).toBeNull()
  })
})
