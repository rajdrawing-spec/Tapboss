import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Search, Plus, Pencil, Trash2, Handshake, Mail, Phone, MessageCircle, Globe, Building2, ChevronLeft, ChevronRight, X } from "lucide-react"
import { useCompany } from "@/contexts/company-context"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { adminApi } from "@/lib/admin-api"

export interface ClientVendor {
  id: number; companyId: number; type: "client" | "vendor"; name: string
  organizationName: string | null; contactPerson: string | null; email: string | null
  phone: string | null; whatsapp: string | null; website: string | null; address: string | null
  notes: string | null; status: "active" | "inactive"; customFields: Record<string, string> | null
  createdAt: string
}

interface Form {
  type: "client" | "vendor"; name: string; organizationName: string; contactPerson: string
  email: string; phone: string; whatsapp: string; website: string; address: string; notes: string
  status: "active" | "inactive"; customFields: { key: string; value: string }[]
}
const emptyForm = (type: "client" | "vendor" = "client"): Form => ({
  type, name: "", organizationName: "", contactPerson: "", email: "", phone: "",
  whatsapp: "", website: "", address: "", notes: "", status: "active", customFields: [],
})

const TYPE_BADGE: Record<string, string> = {
  client: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  vendor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
}

export default function ClientsVendors() {
  const { activeCompany, companies, isParentView } = useCompany()
  const { hasPermission } = useAuth()
  const { toast } = useToast()
  const canManage = hasPermission("clients_vendors.manage")

  const [rows, setRows] = React.useState<ClientVendor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [companyFilter, setCompanyFilter] = React.useState("all") // parent-view only
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const [showDialog, setShowDialog] = React.useState(false)
  const [editing, setEditing] = React.useState<ClientVendor | null>(null)
  const [form, setForm] = React.useState<Form>(emptyForm())
  const [formCompanyId, setFormCompanyId] = React.useState<string>("")
  const [saving, setSaving] = React.useState(false)

  const effectiveCompanyId = activeCompany ? String(activeCompany.id) : companyFilter

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: "25" })
      if (effectiveCompanyId !== "all" && effectiveCompanyId) p.set("companyId", effectiveCompanyId)
      if (typeFilter !== "all") p.set("type", typeFilter)
      if (statusFilter !== "all") p.set("status", statusFilter)
      if (search.trim()) p.set("q", search.trim())
      const data = await adminApi.get(`/client-vendors?${p}`)
      setRows(data.items)
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch { toast({ title: "Failed to load clients & vendors", variant: "destructive" }) }
    finally { setLoading(false) }
  }, [effectiveCompanyId, typeFilter, statusFilter, search, page, toast])

  React.useEffect(() => { setPage(1) }, [effectiveCompanyId, typeFilter, statusFilter, search])
  React.useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])

  const companyName = (id: number) => companies.find((c) => c.id === id)?.name ?? `Company ${id}`

  function openAdd() {
    setEditing(null)
    setForm(emptyForm(typeFilter === "vendor" ? "vendor" : "client"))
    setFormCompanyId(activeCompany ? String(activeCompany.id) : (companies[0] ? String(companies[0].id) : ""))
    setShowDialog(true)
  }
  function openEdit(cv: ClientVendor) {
    setEditing(cv)
    setForm({
      type: cv.type, name: cv.name, organizationName: cv.organizationName ?? "", contactPerson: cv.contactPerson ?? "",
      email: cv.email ?? "", phone: cv.phone ?? "", whatsapp: cv.whatsapp ?? "", website: cv.website ?? "",
      address: cv.address ?? "", notes: cv.notes ?? "", status: cv.status,
      customFields: Object.entries(cv.customFields ?? {}).map(([key, value]) => ({ key, value })),
    })
    setFormCompanyId(String(cv.companyId))
    setShowDialog(true)
  }

  async function save() {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return }
    if (!editing && !formCompanyId) { toast({ title: "Company is required", variant: "destructive" }); return }
    setSaving(true)
    try {
      const customFields: Record<string, string> = {}
      for (const f of form.customFields) if (f.key.trim()) customFields[f.key.trim()] = f.value
      const body: any = {
        type: form.type, name: form.name.trim(),
        organizationName: form.organizationName.trim() || null,
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null, phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null, website: form.website.trim() || null,
        address: form.address.trim() || null, notes: form.notes.trim() || null,
        status: form.status, customFields: Object.keys(customFields).length ? customFields : null,
      }
      if (editing) await adminApi.patch(`/client-vendors/${editing.id}`, body)
      else await adminApi.post("/client-vendors", { ...body, companyId: parseInt(formCompanyId) })
      toast({ title: editing ? "Record updated" : `${form.type === "client" ? "Client" : "Vendor"} added` })
      setShowDialog(false); load()
    } catch (e: any) { toast({ title: e?.message || "Save failed", variant: "destructive" }) }
    finally { setSaving(false) }
  }

  async function del(cv: ClientVendor) {
    if (!confirm(`Delete ${cv.type} "${cv.name}"? This cannot be undone.`)) return
    try { await adminApi.del(`/client-vendors/${cv.id}`); toast({ title: "Deleted" }); load() }
    catch (e: any) { toast({ title: e?.message || "Delete failed", variant: "destructive" }) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Handshake className="w-6 h-6 text-primary" /> Clients & Vendors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isParentView ? "Relationship directory across all companies" : `${activeCompany?.name} relationship directory`}
          </p>
        </div>
        {canManage && <Button onClick={openAdd} data-testid="button-add-client-vendor"><Plus className="w-4 h-4 mr-2" /> Add Record</Button>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact, email…" className="pl-9" data-testid="input-search" />
        </div>
        {isParentView && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-company-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-36" data-testid="select-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="client">Clients</SelectItem>
            <SelectItem value="vendor">Vendors</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No clients or vendors found.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((cv) => (
              <Card key={cv.id} className="group hover:border-primary/40 transition-colors" data-testid={`card-cv-${cv.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{cv.name}</div>
                      {cv.organizationName && <div className="text-xs text-muted-foreground truncate">{cv.organizationName}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className={TYPE_BADGE[cv.type]}>{cv.type === "client" ? "Client" : "Vendor"}</Badge>
                      {cv.status === "inactive" && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {isParentView && <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {companyName(cv.companyId)}</div>}
                    {cv.contactPerson && <div className="flex items-center gap-1.5"><Handshake className="w-3.5 h-3.5" /> {cv.contactPerson}</div>}
                    {cv.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3.5 h-3.5 shrink-0" /> {cv.email}</div>}
                    {cv.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {cv.phone}</div>}
                    {cv.whatsapp && <div className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {cv.whatsapp}</div>}
                    {cv.website && (
                      <a href={cv.website.startsWith("http") ? cv.website : `https://${cv.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline w-fit">
                        <Globe className="w-3.5 h-3.5" /> {cv.website}
                      </a>
                    )}
                  </div>
                  {cv.customFields && Object.keys(cv.customFields).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(cv.customFields).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
                      ))}
                    </div>
                  )}
                  {canManage && (
                    <div className="flex gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(cv)} data-testid={`button-edit-${cv.id}`}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                      <Button variant="outline" size="sm" className="text-red-400" onClick={() => del(cv)} data-testid={`button-delete-${cv.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} record{total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Record" : "Add Client / Vendor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Form["type"] })} disabled={!!editing}>
                <SelectTrigger data-testid="select-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company *</Label>
              <Select value={formCompanyId} onValueChange={setFormCompanyId} disabled={!!editing}>
                <SelectTrigger data-testid="select-form-company"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-form-name" /></div>
            <div><Label>Organization</Label><Input value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} /></div>
            <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
            <div className="col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Form["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Custom Fields</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, customFields: [...form.customFields, { key: "", value: "" }] })}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add field
                </Button>
              </div>
              {form.customFields.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Field name" value={f.key} onChange={(e) => setForm({ ...form, customFields: form.customFields.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} />
                  <Input placeholder="Value" value={f.value} onChange={(e) => setForm({ ...form, customFields: form.customFields.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, customFields: form.customFields.filter((_, j) => j !== i) })}><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-cv">{saving ? "Saving…" : editing ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
