import * as React from "react"
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi, type AdminUser } from "@/lib/admin-api"
import { useCompany } from "@/contexts/company-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Plus, Trash2, UserPlus, X, Briefcase, Eye, Sparkles, ScrollText, Share2, FileText, Plug, RefreshCw, Download } from "lucide-react"

interface ProjectMember {
  id: number
  userId: number
  memberType: "internal" | "client"
  name: string
  email: string
  role: string
}

interface MarketingProject {
  id: number
  companyId: number
  name: string
  brandName: string | null
  brandColor: string | null
  logoUrl: string | null
  status: string
  members: ProjectMember[]
}

/** Super-admin management of Client Marketing Portal projects. */
export default function MarketingProjects() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { companies } = useCompany()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [form, setForm] = React.useState({ name: "", brandName: "", brandColor: "#1d90e8", companyId: "" })

  const { data: projects = [], isLoading } = useQuery<MarketingProject[]>({
    queryKey: ["/api/marketing-projects"],
    queryFn: () => adminApi.get("/marketing-projects"),
  })
  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => adminApi.get("/users"),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/marketing-projects"] })

  const createMut = useMutation({
    mutationFn: () => adminApi.post("/marketing-projects", {
      name: form.name,
      brandName: form.brandName || form.name,
      brandColor: form.brandColor,
      companyId: parseInt(form.companyId),
    }),
    onSuccess: () => {
      invalidate(); setCreateOpen(false)
      setForm({ name: "", brandName: "", brandColor: "#1d90e8", companyId: "" })
      toast({ title: "Project created" })
    },
    onError: (e: Error) => toast({ title: "Failed to create project", description: e.message, variant: "destructive" }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.del(`/marketing-projects/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Project deleted" }) },
    onError: (e: Error) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  })

  const addMemberMut = useMutation({
    mutationFn: (v: { projectId: number; userId: number; memberType: string }) =>
      adminApi.post(`/marketing-projects/${v.projectId}/members`, { userId: v.userId, memberType: v.memberType }),
    onSuccess: () => { invalidate(); toast({ title: "Member added" }) },
    onError: (e: Error) => toast({ title: "Failed to add member", description: e.message, variant: "destructive" }),
  })

  const removeMemberMut = useMutation({
    mutationFn: (v: { projectId: number; userId: number }) =>
      adminApi.del(`/marketing-projects/${v.projectId}/members/${v.userId}`),
    onSuccess: () => { invalidate(); toast({ title: "Member removed" }) },
    onError: (e: Error) => toast({ title: "Failed to remove member", description: e.message, variant: "destructive" }),
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing Intelligence</h1>
          <p className="text-muted-foreground">Projects, performance, AI insights and sync health across your marketing clients.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create marketing project</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Q3 Growth" />
              </div>
              <div className="space-y-2">
                <Label>Brand name (shown to the client)</Label>
                <Input value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} placeholder="Acme Inc." />
              </div>
              <div className="space-y-2">
                <Label>Brand color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border bg-background" />
                  <Input value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="w-32" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!form.name || !form.companyId || createMut.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="projects">
        <TabsList className="flex-wrap">
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
          <TabsTrigger value="sync">Sync Status</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-4">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
          <Briefcase className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground">Create a project to onboard a client into the marketing portal.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              users={users}
              companyName={companies.find((c) => c.id === p.companyId)?.name ?? `Company #${p.companyId}`}
              onDelete={() => deleteMut.mutate(p.id)}
              onAddMember={(userId, memberType) => addMemberMut.mutate({ projectId: p.id, userId, memberType })}
              onRemoveMember={(userId) => removeMemberMut.mutate({ projectId: p.id, userId })}
            />
          ))}
        </div>
      )}
        </TabsContent>
        <TabsContent value="overview" className="mt-4"><IntelOverviewTab companies={companies} mode="overview" /></TabsContent>
        <TabsContent value="performance" className="mt-4"><IntelOverviewTab companies={companies} mode="performance" /></TabsContent>
        <TabsContent value="ai" className="mt-4"><AiInsightsTab projects={projects} companies={companies} /></TabsContent>
        <TabsContent value="sync" className="mt-4"><SyncStatusTab companies={companies} /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------------- Internal marketing intelligence ---------------------- */

interface IntelCompany { id: number; name: string }

function CompanyFilter({ companies, value, onChange }: { companies: IntelCompany[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All companies</SelectItem>
        {companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

const fmtMoney = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`
const fmtCount = (n: number) => n.toLocaleString("en-IN")

interface IntelOverview {
  totals: { spend: number; revenue: number; impressions: number; clicks: number; leads: number; conversions: number; campaigns: number; activeCampaigns: number; roas: number | null; ctr: number | null; cpl: number | null }
  byChannel: { channel: string; campaigns: number; spend: number; revenue: number; impressions: number; clicks: number; leads: number; conversions: number }[]
  connections: { id: number; companyId: number; platform: string; status: string; accountLabel: string | null; lastSyncedAt: string | null; lastError: string | null }[]
  campaigns: { id: number; companyId: number; name: string; channel: string; status: string; budget: number; spent: number; revenue: number; impressions: number; clicks: number; leads: number; conversions: number; roas: number | null; ctr: number | null }[]
}

function IntelOverviewTab({ companies, mode }: { companies: IntelCompany[]; mode: "overview" | "performance" }) {
  const [company, setCompany] = React.useState("all")
  const { data, isLoading, isError } = useQuery<IntelOverview>({
    queryKey: ["/api/marketing-intelligence/overview", company],
    queryFn: () => adminApi.get(`/marketing-intelligence/overview${company === "all" ? "" : `?companyId=${company}`}`),
  })

  if (isLoading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
  if (isError || !data) return <p className="py-8 text-center text-sm text-destructive">Failed to load marketing data.</p>

  const t = data.totals
  const companyName = (id: number) => companies.find((c) => c.id === id)?.name ?? `#${id}`

  return (
    <div className="space-y-5">
      <CompanyFilter companies={companies} value={company} onChange={setCompany} />

      {mode === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Ad Spend", value: fmtMoney(t.spend) },
              { label: "Ad Revenue", value: fmtMoney(t.revenue) },
              { label: "ROAS", value: t.roas != null ? `${t.roas.toFixed(2)}x` : "—" },
              { label: "Campaigns", value: `${fmtCount(t.activeCampaigns)} active / ${fmtCount(t.campaigns)}` },
              { label: "Impressions", value: fmtCount(t.impressions) },
              { label: "Clicks", value: `${fmtCount(t.clicks)}${t.ctr != null ? ` · ${t.ctr.toFixed(2)}% CTR` : ""}` },
              { label: "Leads", value: `${fmtCount(t.leads)}${t.cpl != null ? ` · ${fmtMoney(t.cpl)} CPL` : ""}` },
              { label: "Conversions", value: fmtCount(t.conversions) },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-bold">{c.value}</p>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Platform comparison</CardTitle></CardHeader>
            <CardContent>
              {data.byChannel.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No campaigns yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Channel</th><th className="py-2 pr-3">Campaigns</th><th className="py-2 pr-3">Spend</th><th className="py-2 pr-3">Revenue</th><th className="py-2 pr-3">ROAS</th><th className="py-2 pr-3">Impressions</th><th className="py-2 pr-3">Clicks</th><th className="py-2 pr-3">Leads</th><th className="py-2">Conversions</th>
                    </tr></thead>
                    <tbody>
                      {data.byChannel.map((ch) => (
                        <tr key={ch.channel} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium capitalize">{ch.channel.replace("_", " ")}</td>
                          <td className="py-2 pr-3">{ch.campaigns}</td>
                          <td className="py-2 pr-3">{fmtMoney(ch.spend)}</td>
                          <td className="py-2 pr-3">{fmtMoney(ch.revenue)}</td>
                          <td className="py-2 pr-3">{ch.spend > 0 ? `${(ch.revenue / ch.spend).toFixed(2)}x` : "—"}</td>
                          <td className="py-2 pr-3">{fmtCount(ch.impressions)}</td>
                          <td className="py-2 pr-3">{fmtCount(ch.clicks)}</td>
                          <td className="py-2 pr-3">{fmtCount(ch.leads)}</td>
                          <td className="py-2">{fmtCount(ch.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Platform connections</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.connections.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">No ad platforms connected yet. Use “Ad Accounts” on a project card.</p>
              ) : data.connections.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{c.platform.replace("_", " ")}</Badge>
                    <span className="font-medium">{c.accountLabel || companyName(c.companyId)}</span>
                    <span className="text-xs text-muted-foreground">{companyName(c.companyId)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={c.status === "connected" ? "default" : "destructive"}>{c.status}</Badge>
                    <span className="text-muted-foreground">{c.lastSyncedAt ? `synced ${new Date(c.lastSyncedAt).toLocaleString()}` : "never synced"}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Campaign performance (top 100 by spend)</CardTitle></CardHeader>
          <CardContent>
            {data.campaigns.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Campaign</th><th className="py-2 pr-3">Company</th><th className="py-2 pr-3">Channel</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Spend</th><th className="py-2 pr-3">Revenue</th><th className="py-2 pr-3">ROAS</th><th className="py-2 pr-3">Impr.</th><th className="py-2 pr-3">Clicks</th><th className="py-2 pr-3">CTR</th><th className="py-2 pr-3">Leads</th><th className="py-2">Conv.</th>
                  </tr></thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="max-w-[220px] truncate py-2 pr-3 font-medium">{c.name}</td>
                        <td className="py-2 pr-3">{companyName(c.companyId)}</td>
                        <td className="py-2 pr-3 capitalize">{c.channel.replace("_", " ")}</td>
                        <td className="py-2 pr-3"><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></td>
                        <td className="py-2 pr-3">{fmtMoney(c.spent)}</td>
                        <td className="py-2 pr-3">{fmtMoney(c.revenue)}</td>
                        <td className="py-2 pr-3">{c.roas != null ? `${c.roas.toFixed(2)}x` : "—"}</td>
                        <td className="py-2 pr-3">{fmtCount(c.impressions)}</td>
                        <td className="py-2 pr-3">{fmtCount(c.clicks)}</td>
                        <td className="py-2 pr-3">{c.ctr != null ? `${c.ctr.toFixed(2)}%` : "—"}</td>
                        <td className="py-2 pr-3">{fmtCount(c.leads)}</td>
                        <td className="py-2">{fmtCount(c.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface AiPlanRow { id: number; status: string; summary: string | null; createdAt: string }

function AiInsightsTab({ projects, companies }: { projects: MarketingProject[]; companies: IntelCompany[] }) {
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["/api/marketing-projects", p.id, "ai-plans"],
      queryFn: () => adminApi.get(`/marketing-projects/${p.id}/ai-plans`) as Promise<AiPlanRow[]>,
    })),
  })
  if (projects.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Create a marketing project first — AI plans are generated per project.</p>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {projects.map((p, i) => {
        const q = results[i]
        const latest = q.data?.[0]
        return (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{p.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{companies.find((c) => c.id === p.companyId)?.name ?? `Company #${p.companyId}`}</p>
              </div>
              {latest && <Badge variant={latest.status === "approved" ? "default" : "secondary"}>{latest.status}</Badge>}
            </CardHeader>
            <CardContent>
              {q.isLoading ? (
                <div className="flex h-16 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
              ) : !latest ? (
                <p className="text-sm text-muted-foreground">No AI plan yet — generate one from the project card’s AI Plans dialog, or the client can request one from the portal.</p>
              ) : (
                <>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm">{latest.summary || "Plan generated — open AI Plans on the project card for details."}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Generated {new Date(latest.createdAt).toLocaleString()} · {q.data!.length} plan{q.data!.length === 1 ? "" : "s"} total</p>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

interface SyncJobRow {
  id: number; connectionId: number; status: string; trigger: string | null
  startedAt: string; finishedAt: string | null; rowsUpserted: number | null; error: string | null
  platform: string; accountLabel: string | null; companyId: number | null
}

function SyncStatusTab({ companies }: { companies: IntelCompany[] }) {
  const [company, setCompany] = React.useState("all")
  const { data: jobs = [], isLoading, isError, refetch, isFetching } = useQuery<SyncJobRow[]>({
    queryKey: ["/api/marketing-intelligence/sync-jobs", company],
    queryFn: () => adminApi.get(`/marketing-intelligence/sync-jobs${company === "all" ? "" : `?companyId=${company}`}`),
    refetchInterval: 30_000,
  })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <CompanyFilter companies={companies} value={company} onChange={setCompany} />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">Failed to load sync jobs.</p>
      ) : jobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No sync runs yet. Connect an ad platform and use Sync Now, or wait for the 08/12/16/20 IST schedule.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2.5">Platform</th><th className="p-2.5">Account</th><th className="p-2.5">Company</th><th className="p-2.5">Trigger</th><th className="p-2.5">Status</th><th className="p-2.5">Rows</th><th className="p-2.5">Started</th><th className="p-2.5">Duration</th><th className="p-2.5">Error</th>
            </tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b last:border-0">
                  <td className="p-2.5 capitalize">{j.platform.replace("_", " ")}</td>
                  <td className="max-w-[180px] truncate p-2.5">{j.accountLabel || "—"}</td>
                  <td className="p-2.5">{j.companyId != null ? (companies.find((c) => c.id === j.companyId)?.name ?? `#${j.companyId}`) : "—"}</td>
                  <td className="p-2.5">{j.trigger || "scheduled"}</td>
                  <td className="p-2.5">
                    <Badge variant={j.status === "success" ? "default" : j.status === "running" ? "secondary" : "destructive"}>{j.status}</Badge>
                  </td>
                  <td className="p-2.5">{j.rowsUpserted ?? "—"}</td>
                  <td className="whitespace-nowrap p-2.5">{new Date(j.startedAt).toLocaleString()}</td>
                  <td className="p-2.5">{j.finishedAt ? `${Math.max(0, Math.round((new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()) / 1000))}s` : "—"}</td>
                  <td className="max-w-[240px] truncate p-2.5 text-destructive">{j.error || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, users, companyName, onDelete, onAddMember, onRemoveMember }: {
  project: MarketingProject
  users: AdminUser[]
  companyName: string
  onDelete: () => void
  onAddMember: (userId: number, memberType: string) => void
  onRemoveMember: (userId: number) => void
}) {
  const [userId, setUserId] = React.useState("")
  const [memberType, setMemberType] = React.useState("client")
  const memberIds = new Set(project.members.map((m) => m.userId))
  const candidates = users.filter((u) => !memberIds.has(u.id) && u.status !== "disabled")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded font-bold text-white" style={{ backgroundColor: project.brandColor || "#1d90e8" }}>
            {(project.brandName || project.name).charAt(0).toUpperCase()}
          </div>
          <div>
            <CardTitle className="text-base">{project.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{companyName} · {project.status}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete project">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {project.members.length === 0 && (
            <p className="text-sm text-muted-foreground">No members assigned.</p>
          )}
          {project.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-muted-foreground">{m.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.memberType === "client" ? "default" : "secondary"}>{m.memberType}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveMember(m.userId)} aria-label={`Remove ${m.name}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Add user…" /></SelectTrigger>
            <SelectContent>
              {candidates.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.email})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={memberType} onValueChange={setMemberType}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="icon"
            disabled={!userId}
            onClick={() => { onAddMember(parseInt(userId), memberType); setUserId("") }}
            aria-label="Add member"
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <ShareRecordsDialog projectId={project.id} companyId={project.companyId} />
          <VisibilityDialog projectId={project.id} />
          <ReportsDialog projectId={project.id} />
          <AdConnectionsDialog companyId={project.companyId} />
          <AiPlansDialog projectId={project.id} />
          <AuditDialog projectId={project.id} />
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------- Share marketing records with client ------------------- */

interface LinkableRecord {
  id: number
  name?: string
  title?: string
  channel?: string | null
  status?: string | null
  projectId: number | null
  clientVisible: boolean
}

const SHARE_KINDS: { kind: "campaigns" | "creatives" | "leads"; label: string; path: string }[] = [
  { kind: "campaigns", label: "Campaigns", path: "/campaigns?status=all" },
  { kind: "creatives", label: "Creatives", path: "/marketing/creatives?status=all" },
  { kind: "leads", label: "Leads", path: "/marketing/leads?status=all" },
]

function ShareRecordsDialog({ projectId, companyId }: { projectId: number; companyId: number }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const results = useQueries({
    queries: SHARE_KINDS.map((k) => ({
      queryKey: ["/api/marketing-share", k.kind, companyId],
      queryFn: () => adminApi.get(`${k.path}&companyId=${companyId}`) as Promise<LinkableRecord[]>,
      enabled: open,
    })),
  })
  const queries = SHARE_KINDS.map((k, i) => ({ ...k, query: results[i] }))

  const linkMut = useMutation({
    mutationFn: (v: { kind: string; recordId: number; share: boolean }) =>
      adminApi.patch(`/marketing-projects/link/${v.kind}/${v.recordId}`,
        v.share ? { projectId, clientVisible: true } : { projectId: null }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/marketing-share", v.kind, companyId] })
      toast({ title: v.share ? "Shared with client portal" : "Removed from client portal" })
    },
    onError: (e: Error) => toast({ title: "Failed to update sharing", description: e.message, variant: "destructive" }),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Share2 className="mr-1.5 h-3.5 w-3.5" />Share with client</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Share with client portal</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Only records you turn on here appear in the client portal for this project.
        </p>
        {queries.map(({ kind, label, query }) => (
          <div key={kind} className="space-y-1.5">
            <p className="text-sm font-medium">{label}</p>
            {query.isLoading ? (
              <div className="flex h-16 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
            ) : query.isError ? (
              <div className="flex items-center justify-between rounded-md border border-destructive/40 px-3 py-2">
                <p className="text-xs text-destructive">Failed to load {label.toLowerCase()}.</p>
                <Button size="sm" variant="outline" onClick={() => query.refetch()}>Retry</Button>
              </div>
            ) : !query.data || query.data.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No {label.toLowerCase()} for this company yet.</p>
            ) : (
              query.data.map((r) => {
                const linkedElsewhere = r.projectId !== null && r.projectId !== projectId
                const shared = r.projectId === projectId && r.clientVisible
                return (
                  <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-medium">{r.name ?? r.title ?? `#${r.id}`}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {[r.channel, r.status].filter(Boolean).join(" · ")}
                        {linkedElsewhere ? " · linked to another project" : ""}
                      </span>
                    </div>
                    <Switch
                      checked={shared}
                      disabled={linkMut.isPending || linkedElsewhere}
                      onCheckedChange={(v) => linkMut.mutate({ kind, recordId: r.id, share: v })}
                      aria-label={`Share ${r.name ?? r.title ?? r.id} with client`}
                    />
                  </div>
                )
              })
            )}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}

/* -------------------- Client visibility settings dialog -------------------- */

type Visibility = Record<string, boolean>

const VISIBILITY_FIELDS: { key: string; label: string }[] = [
  { key: "revenue", label: "Revenue & AOV" },
  { key: "orders", label: "Orders & Sales" },
  { key: "adSpend", label: "Ad Spend" },
  { key: "roas", label: "ROAS" },
  { key: "leads", label: "Leads" },
  { key: "cpa", label: "CPA" },
  { key: "conversion", label: "Conversion Rate" },
  { key: "campaigns", label: "Campaigns" },
  { key: "creatives", label: "Creative Library" },
  { key: "reports", label: "Reports" },
  { key: "analytics", label: "Website Analytics (GA4)" },
  { key: "ai", label: "AI Plan" },
  { key: "aiRequiresReview", label: "AI plans need internal approval" },
]

function VisibilityDialog({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Visibility | null>(null)

  const { data } = useQuery<Visibility>({
    queryKey: ["/api/marketing-projects", projectId, "visibility"],
    queryFn: () => adminApi.get(`/marketing-projects/${projectId}/visibility`),
    enabled: open,
  })
  React.useEffect(() => { if (data && open) setDraft(data) }, [data, open])

  const saveMut = useMutation({
    mutationFn: (v: Visibility) => adminApi.put(`/marketing-projects/${projectId}/visibility`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketing-projects", projectId, "visibility"] })
      toast({ title: "Visibility settings saved" }); setOpen(false)
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Eye className="mr-1.5 h-3.5 w-3.5" />Visibility</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Client visibility settings</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Hidden sections and KPIs are removed server-side — the client never receives that data.
        </p>
        {!draft ? (
          <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
        ) : (
          <div className="space-y-2">
            {VISIBILITY_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">{f.label}</span>
                <Switch checked={draft[f.key] ?? false} onCheckedChange={(v) => setDraft({ ...draft, [f.key]: v })} />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => draft && saveMut.mutate(draft)} disabled={!draft || saveMut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------- AI plan review dialog ------------------------- */

interface AdminAiPlan {
  id: number
  status: string
  summary: string | null
  insights: { observed?: { working?: string[]; underperforming?: string[] } } | null
  reviewNote: string | null
  createdAt: string
}

function AiPlansDialog({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")

  const { data: plans = [], isLoading } = useQuery<AdminAiPlan[]>({
    queryKey: ["/api/marketing-projects", projectId, "ai-plans"],
    queryFn: () => adminApi.get(`/marketing-projects/${projectId}/ai-plans`),
    enabled: open,
  })

  const reviewMut = useMutation({
    mutationFn: (v: { planId: number; action: string }) =>
      adminApi.patch(`/marketing-projects/${projectId}/ai-plans/${v.planId}`, { action: v.action, reviewNote: note || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketing-projects", projectId, "ai-plans"] })
      setNote(""); toast({ title: "Plan updated" })
    },
    onError: (e: Error) => toast({ title: "Failed to update plan", description: e.message, variant: "destructive" }),
  })

  const badge = (s: string) =>
    s === "published" ? "default" : s === "pending_review" ? "secondary" : "outline"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Sparkles className="mr-1.5 h-3.5 w-3.5" />AI Plans</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>AI plan review</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
        ) : plans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No AI plans generated for this project yet.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Plan #{p.id} · {new Date(p.createdAt).toLocaleString("en-IN")}</div>
                  <Badge variant={badge(p.status)}>{p.status.replace("_", " ")}</Badge>
                </div>
                {p.summary && <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>}
                {p.reviewNote && <p className="mt-1 text-xs text-muted-foreground">Review note: {p.reviewNote}</p>}
                {p.status === "pending_review" && (
                  <div className="mt-2 space-y-2">
                    <Textarea placeholder="Review note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewMut.mutate({ planId: p.id, action: "approve" })} disabled={reviewMut.isPending}>Approve & publish</Button>
                      <Button size="sm" variant="outline" onClick={() => reviewMut.mutate({ planId: p.id, action: "reject" })} disabled={reviewMut.isPending}>Reject</Button>
                    </div>
                  </div>
                )}
                {p.status === "published" && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => reviewMut.mutate({ planId: p.id, action: "archive" })} disabled={reviewMut.isPending}>Unpublish</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------- Audit log dialog --------------------------- */

interface AuditRow {
  id: number
  userEmail: string | null
  action: string
  detail: Record<string, unknown> | null
  createdAt: string
}

const AUDIT_LABELS: Record<string, string> = {
  "portal.overview_viewed": "Viewed dashboard",
  "portal.report_viewed": "Viewed report",
  "portal.creative_downloaded": "Downloaded creative",
  "portal.ai_plan_generated": "Generated AI plan",
  "portal.ai_plan_reviewed": "AI plan reviewed",
  "portal.visibility_changed": "Visibility settings changed",
}

function AuditDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false)
  const { data: rows = [], isLoading } = useQuery<AuditRow[]>({
    queryKey: ["/api/marketing-projects", projectId, "audit"],
    queryFn: () => adminApi.get(`/marketing-projects/${projectId}/audit`),
    enabled: open,
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ScrollText className="mr-1.5 h-3.5 w-3.5" />Audit</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Client access audit log</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No client activity recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{AUDIT_LABELS[r.action] ?? r.action}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.userEmail ?? "system"}
                    {r.detail && "name" in r.detail ? ` · ${String(r.detail.name)}` : ""}
                    {r.detail && "changed" in r.detail && Array.isArray(r.detail.changed) && r.detail.changed.length > 0 ? ` · ${(r.detail.changed as string[]).join(", ")}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------- Marketing PDF reports ------------------------- */

interface AdminReport {
  id: number; type: string; title: string; status: string
  periodFrom: string; periodTo: string; createdAt: string; approvedAt: string | null
}

const toYMD = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ReportsDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  const [type, setType] = React.useState("monthly")
  const [from, setFrom] = React.useState(toYMD(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = React.useState(toYMD(new Date()))

  const { data: reports, isLoading } = useQuery<AdminReport[]>({
    queryKey: ["/api/marketing-projects", projectId, "reports"],
    queryFn: () => adminApi.get(`/marketing-projects/${projectId}/reports`),
    enabled: open,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/marketing-projects", projectId, "reports"] })

  const genMut = useMutation({
    mutationFn: () => adminApi.post(`/marketing-projects/${projectId}/reports`, { type, from, to }),
    onSuccess: () => { invalidate(); toast({ title: "Report generated", description: "Review it, then approve to publish to the client portal." }) },
    onError: (e: Error) => toast({ title: "Failed to generate report", description: e.message, variant: "destructive" }),
  })
  const actionMut = useMutation({
    mutationFn: (v: { id: number; action: "approve" | "archive" }) =>
      adminApi.patch(`/marketing-projects/${projectId}/reports/${v.id}`, { action: v.action }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Failed to update report", description: e.message, variant: "destructive" }),
  })
  const delMut = useMutation({
    mutationFn: (id: number) => adminApi.del(`/marketing-projects/${projectId}/reports/${id}`),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Failed to delete report", description: e.message, variant: "destructive" }),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" /> Reports</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>PDF reports</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Generate a report snapshot for a period, review the PDF, then approve it to publish it in the client portal.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="campaign">Campaign</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" className="w-38" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" className="w-38" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
            {genMut.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : !reports || reports.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No reports yet.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {r.title}
                    <Badge variant={r.status === "approved" ? "default" : "secondary"} className="capitalize">{r.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.periodFrom} → {r.periodTo}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/api/marketing-projects/${projectId}/reports/${r.id}/pdf`} download>
                      <Download className="mr-1 h-3.5 w-3.5" /> PDF
                    </a>
                  </Button>
                  {r.status === "draft" && (
                    <Button size="sm" onClick={() => actionMut.mutate({ id: r.id, action: "approve" })} disabled={actionMut.isPending}>
                      Approve
                    </Button>
                  )}
                  {r.status === "approved" && (
                    <Button variant="outline" size="sm" onClick={() => actionMut.mutate({ id: r.id, action: "archive" })} disabled={actionMut.isPending}>
                      Archive
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Delete report"
                    onClick={() => delMut.mutate(r.id)} disabled={delMut.isPending}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------- Ad platform connections ------------------------ */

interface AdConnection {
  id: number; companyId: number; platform: string; status: string
  accountLabel: string | null; lastSyncedAt: string | null; lastError: string | null
  accounts: { id: number; externalId: string; name: string; currency: string; syncEnabled: boolean }[]
}

function AdConnectionsDialog({ companyId }: { companyId: number }) {
  const [open, setOpen] = React.useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  const [platform, setPlatform] = React.useState<"meta" | "google" | "ga4">("meta")
  const [token, setToken] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [g, setG] = React.useState({ developerToken: "", clientId: "", clientSecret: "", refreshToken: "", loginCustomerId: "", label: "" })
  const setGField = (k: keyof typeof g) => (e: React.ChangeEvent<HTMLInputElement>) => setG((p) => ({ ...p, [k]: e.target.value }))

  const { data: connections, isLoading } = useQuery<AdConnection[]>({
    queryKey: ["/api/ad-connections"],
    queryFn: () => adminApi.get("/ad-connections"),
    enabled: open,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/ad-connections"] })

  const connectMut = useMutation({
    mutationFn: () => adminApi.post("/ad-connections/meta", { companyId, accessToken: token, accountLabel: label || undefined }),
    onSuccess: () => { setToken(""); setLabel(""); invalidate(); toast({ title: "Meta connected", description: "Enable the ad accounts you want to sync, then run Sync Now." }) },
    onError: (e: Error) => toast({ title: "Failed to connect Meta", description: e.message, variant: "destructive" }),
  })
  const connectGoogleMut = useMutation({
    mutationFn: () => adminApi.post("/ad-connections/google", {
      companyId,
      developerToken: g.developerToken.trim(),
      clientId: g.clientId.trim(),
      clientSecret: g.clientSecret.trim(),
      refreshToken: g.refreshToken.trim(),
      loginCustomerId: g.loginCustomerId.trim() || undefined,
      accountLabel: g.label || undefined,
    }),
    onSuccess: () => {
      setG({ developerToken: "", clientId: "", clientSecret: "", refreshToken: "", loginCustomerId: "", label: "" })
      invalidate()
      toast({ title: "Google Ads connected", description: "Enable the accounts you want to sync, then run Sync Now." })
    },
    onError: (e: Error) => toast({ title: "Failed to connect Google Ads", description: e.message, variant: "destructive" }),
  })
  const googleReady = g.developerToken && g.clientId && g.clientSecret && g.refreshToken
  const [ga4, setGa4] = React.useState({ serviceAccountJson: "", propertyId: "", label: "" })
  const connectGa4Mut = useMutation({
    mutationFn: () => adminApi.post("/ad-connections/ga4", {
      companyId,
      serviceAccountJson: ga4.serviceAccountJson.trim(),
      propertyId: ga4.propertyId.trim(),
      accountLabel: ga4.label || undefined,
    }),
    onSuccess: () => {
      setGa4({ serviceAccountJson: "", propertyId: "", label: "" })
      invalidate()
      toast({ title: "GA4 connected", description: "Website analytics will sync on the regular schedule, or run Sync Now." })
    },
    onError: (e: Error) => toast({ title: "Failed to connect GA4", description: e.message, variant: "destructive" }),
  })
  const toggleMut = useMutation({
    mutationFn: (v: { connectionId: number; accountId: number; syncEnabled: boolean }) =>
      adminApi.patch(`/ad-connections/${v.connectionId}/accounts/${v.accountId}`, { syncEnabled: v.syncEnabled }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Failed to update account", description: e.message, variant: "destructive" }),
  })
  const syncMut = useMutation({
    mutationFn: (id: number) => adminApi.post(`/ad-connections/${id}/sync`, {}),
    onSuccess: (r: { rows: number; status: string }) => { invalidate(); toast({ title: "Sync finished", description: `${r.rows} daily rows updated (${r.status}).` }) },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  })
  const disconnectMut = useMutation({
    mutationFn: (id: number) => adminApi.del(`/ad-connections/${id}`),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Failed to disconnect", description: e.message, variant: "destructive" }),
  })

  const companyConnections = (connections ?? []).filter((c) => c.companyId === companyId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plug className="mr-2 h-4 w-4" /> Ad Accounts</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Ad platform connections</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Metrics sync automatically at 08:00, 12:00, 16:00 and 20:00 IST.
        </p>
        <div className="flex gap-1.5">
          <Button variant={platform === "meta" ? "default" : "outline"} size="sm" onClick={() => setPlatform("meta")}>Meta</Button>
          <Button variant={platform === "google" ? "default" : "outline"} size="sm" onClick={() => setPlatform("google")}>Google Ads</Button>
          <Button variant={platform === "ga4" ? "default" : "outline"} size="sm" onClick={() => setPlatform("ga4")}>GA4</Button>
        </div>
        {platform === "ga4" ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Create a service account in Google Cloud Console, enable the Google Analytics
              Data API, add the service account email as a <strong>Viewer</strong> on the GA4
              property, then paste its JSON key and the numeric property ID here.
            </p>
            <Label className="text-xs">Service account JSON key</Label>
            <textarea
              className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              value={ga4.serviceAccountJson}
              placeholder='{"type":"service_account", …}'
              onChange={(e) => setGa4((p) => ({ ...p, serviceAccountJson: e.target.value }))}
            />
            <Label className="text-xs">GA4 property ID</Label>
            <Input value={ga4.propertyId} placeholder="123456789" onChange={(e) => setGa4((p) => ({ ...p, propertyId: e.target.value }))} />
            <Label className="text-xs">Label (optional)</Label>
            <Input value={ga4.label} placeholder="e.g. LHO website" onChange={(e) => setGa4((p) => ({ ...p, label: e.target.value }))} />
            <Button size="sm" onClick={() => connectGa4Mut.mutate()} disabled={!ga4.serviceAccountJson || !ga4.propertyId || connectGa4Mut.isPending}>
              {connectGa4Mut.isPending ? "Connecting…" : "Connect GA4"}
            </Button>
          </div>
        ) : platform === "meta" ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Use a long-lived System User access token from your Meta app
              (Business Settings → System Users → Generate token with <code>ads_read</code>).
            </p>
            <Label className="text-xs">Meta access token</Label>
            <Input type="password" value={token} placeholder="EAAB…" onChange={(e) => setToken(e.target.value)} />
            <Label className="text-xs">Label (optional)</Label>
            <Input value={label} placeholder="e.g. LHO Business Manager" onChange={(e) => setLabel(e.target.value)} />
            <Button size="sm" onClick={() => connectMut.mutate()} disabled={!token || connectMut.isPending}>
              {connectMut.isPending ? "Connecting…" : "Connect Meta"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Needs a Google Ads API developer token (API Center of your manager account),
              an OAuth client ID/secret from Google Cloud Console, and a refresh token
              authorized with the <code>adwords</code> scope.
            </p>
            <Label className="text-xs">Developer token</Label>
            <Input type="password" value={g.developerToken} onChange={setGField("developerToken")} />
            <Label className="text-xs">OAuth client ID</Label>
            <Input value={g.clientId} placeholder="….apps.googleusercontent.com" onChange={setGField("clientId")} />
            <Label className="text-xs">OAuth client secret</Label>
            <Input type="password" value={g.clientSecret} onChange={setGField("clientSecret")} />
            <Label className="text-xs">Refresh token</Label>
            <Input type="password" value={g.refreshToken} onChange={setGField("refreshToken")} />
            <Label className="text-xs">Manager (MCC) customer ID — optional</Label>
            <Input value={g.loginCustomerId} placeholder="123-456-7890" onChange={setGField("loginCustomerId")} />
            <Label className="text-xs">Label (optional)</Label>
            <Input value={g.label} placeholder="e.g. LHO Google Ads" onChange={setGField("label")} />
            <Button size="sm" onClick={() => connectGoogleMut.mutate()} disabled={!googleReady || connectGoogleMut.isPending}>
              {connectGoogleMut.isPending ? "Connecting…" : "Connect Google Ads"}
            </Button>
          </div>
        )}
        {isLoading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading…</p>
        ) : companyConnections.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No connections for this company yet.</p>
        ) : (
          <div className="space-y-3">
            {companyConnections.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <span className="capitalize">{c.platform}</span>
                      {c.accountLabel && <span className="text-sm text-muted-foreground">· {c.accountLabel}</span>}
                      <Badge variant={c.status === "connected" ? "default" : "destructive"} className="capitalize">{c.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.lastSyncedAt ? `Last synced ${new Date(c.lastSyncedAt).toLocaleString("en-IN")}` : "Never synced"}
                    </div>
                    {c.lastError && <div className="text-xs text-destructive">{c.lastError}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => syncMut.mutate(c.id)} disabled={syncMut.isPending}>
                      <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncMut.isPending ? "animate-spin" : ""}`} /> Sync now
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Disconnect"
                      onClick={() => disconnectMut.mutate(c.id)} disabled={disconnectMut.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {c.accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                      <div>
                        <span className="font-medium">{a.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{a.externalId} · {a.currency}</span>
                      </div>
                      <Switch checked={a.syncEnabled}
                        onCheckedChange={(v) => toggleMut.mutate({ connectionId: c.id, accountId: a.id, syncEnabled: v })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
