import * as React from "react"
import { useListCompanies } from "@workspace/api-client-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Search, Plus, Pencil, Trash2, PackageSearch, AlertTriangle, Sparkles, Upload, Download, Wand2, ScanBarcode, ImagePlus, Loader2, FileSpreadsheet, Check, Link, RefreshCw, ArrowLeft, ArrowRight, Star, X } from "lucide-react"
import { useCompany } from "@/contexts/company-context"
import { useToast } from "@/hooks/use-toast"
import AiProductPanel from "@/components/ai-products/ai-product-panel"

const API_BASE = ""

interface ProductForm {
  companyId: string
  name: string
  sku: string
  brand: string
  category: string
  subcategory: string
  description: string
  shortDescription: string
  price: string
  mrp: string
  costPrice: string
  gst: string
  stockQuantity: string
  reorderLevel: string
  warehouseLocation: string
  weight: string
  dimensions: string
  hsn: string
  status: string
  imageUrl: string
  sourceLink: string
}

interface ProductVariant {
  id?: number
  sku: string
  name: string
  price: string
  stockQuantity: string
  barcode?: string
  attributes?: Record<string, string>
}

interface AutoFillData {
  name?: string
  sku?: string
  category?: string
  subcategory?: string
  brand?: string
  color?: string
  size?: string
  weight?: string
  dimensions?: string
  material?: string
  sleeveType?: string
  neckType?: string
  pattern?: string
  occasion?: string
  season?: string
  fit?: string
  length?: string
  style?: string
  gender?: string
  ageGroup?: string
  keywords?: string[]
  seoTags?: string[]
  attributes?: Record<string, string>
}

interface ProductImage {
  key: string
  objectPath: string
  preview: string
  id?: number
  isPrimary?: boolean
  analysisDataUrl?: string
}

interface DraftReview {
  images: ProductImage[]
  autoFill: AutoFillData
}

const emptyForm = (): ProductForm => ({
  companyId: "", name: "", sku: "", brand: "", category: "", subcategory: "",
  description: "", shortDescription: "", price: "", mrp: "", costPrice: "", gst: "",
  stockQuantity: "0", reorderLevel: "10", warehouseLocation: "", weight: "", dimensions: "", hsn: "",
  status: "active", imageUrl: "", sourceLink: "",
})

function toSlug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function autoGenerateSourceLink(name: string, sku: string): string {
  const slug = toSlug(name) || toSlug(sku) || "product"
  return `https://store.example.com/products/${slug}`
}

export function productImagePreview(path: string): string {
  if (path.startsWith("/objects/")) return `/api/storage/objects/${path.slice("/objects/".length)}`
  return path
}

export default function Inventory() {
  const { activeCompany } = useCompany()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [uploadingProductImage, setUploadingProductImage] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [showDialog, setShowDialog] = React.useState(false)
  const [editing, setEditing] = React.useState<any>(null)
  const [aiProduct, setAiProduct] = React.useState<any>(null)
  const [form, setForm] = React.useState<ProductForm>(emptyForm())
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState<number | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importCompanyId, setImportCompanyId] = React.useState("")
  const [importingJob, setImportingJob] = React.useState(false)
  const [generatingSku, setGeneratingSku] = React.useState(false)
  const [autoFill, setAutoFill] = React.useState<AutoFillData | null>(null)
  const [variants, setVariants] = React.useState<ProductVariant[]>([])
  const [barcodeImage, setBarcodeImage] = React.useState<string | null>(null)
  const [generatingBarcode, setGeneratingBarcode] = React.useState(false)
  const [generatingMarketplace, setGeneratingMarketplace] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [media, setMedia] = React.useState<ProductImage[]>([])
  const [removedImageIds, setRemovedImageIds] = React.useState<number[]>([])
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const [draftQueue, setDraftQueue] = React.useState<DraftReview[]>([])
  const [draftIndex, setDraftIndex] = React.useState(0)

  const { data: companies } = useListCompanies({ query: { enabled: true, queryKey: ["/api/companies"] } })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["/api/products", activeCompany?.id ?? null, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (activeCompany) params.set("companyId", String(activeCompany.id))
      if (search) params.set("search", search)
      const response = await fetch(`/api/products?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const requestError = new Error(body?.error || `Could not load products (${response.status})`) as Error & {
          status?: number
        }
        requestError.status = response.status
        throw requestError
      }
      if (!body || !Array.isArray(body.items) || typeof body.total !== "number") {
        throw new Error("The products service returned an invalid response")
      }
      return body as { items: any[]; total: number; page: number; limit: number }
    },
    staleTime: 0,
    // The static frontend can become available before the API has completed
    // its production startup migrations. Keep retrying transient gateway/server
    // failures through that warm-up window instead of leaving a false error.
    retry: (failureCount, requestError) => {
      const status = (requestError as Error & { status?: number }).status
      return (status == null || status >= 500) && failureCount < 8
    },
    retryDelay: 3_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  })

  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [activeCompany?.id, page, search])

  // ── AI draft studio — images are always reviewed before product creation ──
  const [quickOpen, setQuickOpen] = React.useState(false)
  const [quickImages, setQuickImages] = React.useState<Array<ProductImage & { group: number }>>([])
  const [quickCompanyId, setQuickCompanyId] = React.useState("")
  const [quickCreating, setQuickCreating] = React.useState(false)

  function openQuickAdd() {
    setQuickImages([])
    setQuickCompanyId(activeCompany ? String(activeCompany.id) : "")
    setQuickOpen(true)
  }

  function openImport() {
    setImportFile(null)
    setImportCompanyId(activeCompany ? String(activeCompany.id) : "")
    setImporting(true)
  }

  async function uploadCatalogImage(file: File, companyId: number): Promise<string | null> {
    setUploadingProductImage(true)
    try {
      const request = await fetch(`${API_BASE}/api/products/media/upload?companyId=${companyId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      if (!request.ok) throw new Error("Product storage unavailable")
      const upload = await request.json()
      return upload.objectPath
    } catch {
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(file)
      })
    } finally {
      setUploadingProductImage(false)
    }
  }

  async function handleQuickImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 30)
    if (!files.length) return
    const companyId = parseInt(quickCompanyId)
    if (!companyId) {
      toast({ title: "Select a company before uploading photos", variant: "destructive" })
      e.target.value = ""
      return
    }
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        toast({ title: "Photo too large", description: `${file.name} is over 8 MB`, variant: "destructive" })
        continue
      }
      const analysisDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const objectPath = await uploadCatalogImage(file, companyId)
      if (objectPath) {
        setQuickImages(prev => [...prev, {
          key: `${objectPath}-${Date.now()}-${prev.length}`,
          objectPath,
          preview: URL.createObjectURL(file),
          analysisDataUrl,
          group: Math.max(1, ...prev.map(image => image.group), 1),
        }])
      }
    }
    e.target.value = ""
  }

  async function handleQuickCreate() {
    const companyId = parseInt(quickCompanyId)
    if (!companyId) { toast({ title: "Select a company", variant: "destructive" }); return }
    if (!quickImages.length) { toast({ title: "Upload at least one photo", variant: "destructive" }); return }
    setQuickCreating(true)
    try {
      const grouped = [...new Set(quickImages.map(image => image.group))].sort((a, b) => a - b)
      const reviews: DraftReview[] = []
      for (const group of grouped) {
        const images = quickImages.filter(image => image.group === group)
        if (images.length > 10) throw new Error(`Group ${group} has ${images.length} images. A product can have at most 10.`)
        const res = await fetch(`${API_BASE}/api/ai-products/analyze-draft`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, images: images.map(image => image.analysisDataUrl) }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Could not analyze group ${group}`)
        }
        const result = await res.json()
        reviews.push({ images, autoFill: result.autoFill || result.draft || result.analysis || result })
      }
      setDraftQueue(reviews)
      setDraftIndex(0)
      setQuickOpen(false)
      openDraftReview(reviews[0], companyId)
      toast({ title: "Drafts ready for review", description: `${reviews.length} product ${reviews.length === 1 ? "draft" : "drafts"} created. Nothing has been saved.` })
    } catch (e: any) {
      toast({ title: "Could not prepare drafts", description: e?.message, variant: "destructive" })
    } finally { setQuickCreating(false) }
  }

  function openDraftReview(review: DraftReview, companyId: number) {
    const suggestion = review.autoFill || {}
    setEditing(null)
    setForm({
      ...emptyForm(),
      companyId: String(companyId),
      name: suggestion.name || "",
      sku: suggestion.sku || "",
      brand: suggestion.brand || "",
      category: suggestion.category || "",
      subcategory: suggestion.subcategory || "",
      weight: suggestion.weight || "",
      dimensions: suggestion.dimensions || "",
      description: [suggestion.material, suggestion.pattern, suggestion.occasion, suggestion.fit].filter(Boolean).join(". "),
      imageUrl: review.images[0]?.objectPath || "",
    })
    setMedia(review.images.map((image, index) => ({ ...image, isPrimary: index === 0 })))
    setRemovedImageIds([])
    setAutoFill(suggestion)
    setVariants([])
    setBarcodeImage(null)
    setShowDialog(true)
  }

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm(), companyId: activeCompany ? String(activeCompany.id) : "" })
    setMedia([])
    setRemovedImageIds([])
    setDraftQueue([])
    setAutoFill(null)
    setVariants([])
    setBarcodeImage(null)
    setShowDialog(true)
  }
  function openEdit(p: any) {
    setEditing(p)
    setForm({
      companyId: String(p.companyId), name: p.name, sku: p.sku ?? "", brand: p.brand ?? "",
      category: p.category ?? "", subcategory: p.subcategory ?? "",
      description: p.description ?? "", shortDescription: p.shortDescription ?? "",
      price: String(p.price), mrp: String(p.mrp ?? ""), costPrice: String(p.costPrice ?? ""),
      gst: String(p.gst ?? ""), stockQuantity: String(p.stockQuantity), reorderLevel: String(p.reorderLevel),
      warehouseLocation: p.warehouseLocation ?? "", weight: p.weight ?? "", dimensions: p.dimensions ?? "", hsn: p.hsn ?? "",
      status: p.status, imageUrl: p.imageUrl ?? "", sourceLink: p.sourceLink ?? "",
    })
    setMedia(p.imageUrl ? [{ key: `legacy-${p.id}`, objectPath: p.imageUrl, preview: productImagePreview(p.imageUrl), isPrimary: true }] : [])
    setRemovedImageIds([])
    setDraftQueue([])
    setAutoFill(null)
    setVariants([])
    setBarcodeImage(p.barcodeImage ?? null)
    setShowDialog(true)
    fetch(`${API_BASE}/api/ai-products/${p.id}/ai-metadata`, { credentials: "include" })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => {
        if (Array.isArray(result.images) && result.images.length) {
          const ordered = [...result.images].sort((a: any, b: any) =>
            Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || (a.sortOrder ?? a.position ?? a.id) - (b.sortOrder ?? b.position ?? b.id)
          )
          const storedImages: ProductImage[] = ordered.map((image: any) => ({
            key: `existing-${image.id}`,
            id: image.id,
            objectPath: image.objectPath,
            preview: productImagePreview(image.objectPath),
            isPrimary: image.objectPath === p.imageUrl || Boolean(image.isPrimary),
          }))
          if (p.imageUrl && !storedImages.some((image: ProductImage) => image.objectPath === p.imageUrl)) {
            storedImages.unshift({ key: `legacy-${p.id}`, objectPath: p.imageUrl, preview: productImagePreview(p.imageUrl), isPrimary: true })
          }
          setMedia(storedImages.map((image: ProductImage, index: number) => ({ ...image, isPrimary: index === 0 })))
        }
      })
      .catch(() => {})
  }

  async function handleSave() {
    setSaving(true)
    try {
      let sku = form.sku.trim()
      if (!sku) sku = await generateSkuInternal(parseInt(form.companyId), form.name, form.category)
      const body = {
        companyId: parseInt(form.companyId), name: form.name, sku,
        brand: form.brand || undefined, category: form.category || undefined, subcategory: form.subcategory || undefined,
        description: form.description || undefined, shortDescription: form.shortDescription || undefined,
        price: parseFloat(form.price), mrp: form.mrp ? parseFloat(form.mrp) : undefined,
        costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
        gst: form.gst ? parseFloat(form.gst) : undefined,
        stockQuantity: parseInt(form.stockQuantity), reorderLevel: parseInt(form.reorderLevel),
        warehouseLocation: form.warehouseLocation || undefined, weight: form.weight || undefined,
        dimensions: form.dimensions || undefined, hsn: form.hsn || undefined, status: form.status,
        imageUrl: media[0]?.objectPath || null,
        sourceLink: form.sourceLink || undefined,
      }
      const url = editing ? `${API_BASE}/api/products/${editing.id}` : `${API_BASE}/api/products`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        throw new Error(errorBody.error || "Could not save product")
      }

      const saved = await res.json()
      const productId = saved.id || editing?.id

      const newImages = media.filter(image => !image.id)
      if (newImages.length > 0 && productId) {
        await Promise.all(newImages.map(image =>
          fetch(`${API_BASE}/api/products/${productId}/images`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectPath: image.objectPath,
              isPrimary: media.indexOf(image) === 0,
              sortOrder: media.indexOf(image),
              altText: `${form.name} ${media.indexOf(image) === 0 ? "front" : "angle " + media.indexOf(image)}`,
            }),
          })
        ))
      }

      if (editing && productId) {
        const orderResponse = await fetch(`${API_BASE}/api/products/${productId}/images/reorder`, {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: media.map((image, index) => ({ id: image.id, objectPath: image.objectPath, position: index, isPrimary: index === 0 })) }),
        })
        if (!orderResponse.ok && orderResponse.status !== 404 && orderResponse.status !== 405) throw new Error("Could not reorder images")
        for (const imageId of removedImageIds) {
          const removeResponse = await fetch(`${API_BASE}/api/products/${productId}/images/${imageId}`, { method: "DELETE", credentials: "include" })
          if (!removeResponse.ok) throw new Error("Could not remove image")
        }
      }

      if (variants.length > 0 && productId) {
        await Promise.all(variants.map(v =>
          fetch(`${API_BASE}/api/products/${productId}/variants`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sku: v.sku, name: v.name, price: parseFloat(v.price), stockQuantity: parseInt(v.stockQuantity),
              barcode: v.barcode || undefined, attributes: v.attributes || {},
            }),
          })
        ))
      }

      toast({ title: editing ? "Product updated" : "Product added" })
      refetch()
      const nextDraft = draftQueue[draftIndex + 1]
      if (!editing && nextDraft) {
        setDraftIndex(index => index + 1)
        openDraftReview(nextDraft, parseInt(form.companyId))
      } else {
        setShowDialog(false)
        setDraftQueue([])
        setQuickImages([])
      }
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Could not save product", variant: "destructive" })
    } finally { setSaving(false) }
  }

  async function generateSkuInternal(companyId: number, name: string, category: string): Promise<string> {
    try {
      const res = await fetch(`${API_BASE}/api/ai-products/generate-sku`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, name, category }),
      })
      if (!res.ok) throw new Error()
      const { sku } = await res.json()
      return sku
    } catch {
      return `${category.slice(0, 3).toUpperCase() || "PRD"}-${Date.now().toString().slice(-6)}`
    }
  }

  async function generateSku() {
    if (!form.name || !form.category) {
      toast({ title: "Enter name and category first", variant: "destructive" })
      return
    }
    setGeneratingSku(true)
    try {
      const sku = await generateSkuInternal(parseInt(form.companyId || "0") || activeCompany?.id || 0, form.name, form.category)
      setForm(f => ({ ...f, sku }))
    } catch {
      toast({ title: "SKU generation failed", variant: "destructive" })
    } finally { setGeneratingSku(false) }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const uploaded: ProductImage[] = []
    const companyId = parseInt(form.companyId)
    if (!companyId) {
      toast({ title: "Select a company before uploading images", variant: "destructive" })
      e.target.value = ""
      return
    }
    for (const file of files) {
      const objectPath = await uploadCatalogImage(file, companyId)
      if (objectPath) uploaded.push({
        key: `${objectPath}-${Date.now()}-${uploaded.length}`,
        objectPath,
        preview: URL.createObjectURL(file),
      })
    }
    if (uploaded.length) {
      setMedia(prev => {
        const next = [...prev, ...uploaded].slice(0, 10)
        return next.map((image, index) => ({ ...image, isPrimary: index === 0 }))
      })
      if (!form.imageUrl) setForm(f => ({ ...f, imageUrl: uploaded[0].objectPath }))
    }
    e.target.value = ""
  }

  function moveImage(index: number, direction: -1 | 1) {
    setMedia(current => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((image, position) => ({ ...image, isPrimary: position === 0 }))
    })
  }

  function moveImageTo(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    setMedia(current => {
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      setForm(formState => ({ ...formState, imageUrl: next[0]?.objectPath || "" }))
      return next.map((image, position) => ({ ...image, isPrimary: position === 0 }))
    })
  }

  function makeMainImage(index: number) {
    setMedia(current => {
      const next = [...current]
      const [chosen] = next.splice(index, 1)
      next.unshift(chosen)
      setForm(formState => ({ ...formState, imageUrl: chosen.objectPath }))
      return next.map((image, position) => ({ ...image, isPrimary: position === 0 }))
    })
  }

  function removeImage(index: number) {
    setMedia(current => {
      const image = current[index]
      if (image.id) setRemovedImageIds(ids => [...ids, image.id!])
      if (image.preview.startsWith("blob:")) URL.revokeObjectURL(image.preview)
      const next = current.filter((_, position) => position !== index)
      setForm(formState => ({ ...formState, imageUrl: next[0]?.objectPath || "" }))
      return next.map((item, position) => ({ ...item, isPrimary: position === 0 }))
    })
  }

  function applyAutoFill() {
    if (!autoFill) return
    setForm(f => ({
      ...f,
      name: autoFill.name || f.name,
      category: autoFill.category || f.category,
      subcategory: autoFill.subcategory || f.subcategory,
      brand: autoFill.brand || f.brand,
      weight: autoFill.weight || f.weight,
      dimensions: autoFill.dimensions || f.dimensions,
      description: f.description || [autoFill.material, autoFill.sleeveType, autoFill.neckType, autoFill.pattern, autoFill.occasion, autoFill.fit].filter(Boolean).join(". ") || f.description,
    }))
    if (autoFill.keywords?.length) {
      toast({ title: "Auto-fill applied", description: `${autoFill.keywords?.length ?? 0} keywords detected` })
    }
    setAutoFill(null)
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this product?")) return
    setDeleting(id)
    try {
      const res = await fetch(`${API_BASE}/api/products/${id}`, { method: "DELETE", credentials: "include" })
      if (!res.ok) throw new Error()
      toast({ title: "Product deleted" }); refetch()
    } catch {
      toast({ title: "Error", description: "Could not delete", variant: "destructive" })
    } finally { setDeleting(null) }
  }

  async function exportCsv() {
    if (!activeCompany) { toast({ title: "Select a company" }); return }
    try {
      const res = await fetch(`${API_BASE}/api/ai-products/export-csv`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `products-${activeCompany.id}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "Error", description: "Export failed", variant: "destructive" })
    }
  }

  async function importCsv(file: File) {
    const companyId = Number(importCompanyId)
    if (!companyId) { toast({ title: "Select a company", variant: "destructive" }); return }
    setImportingJob(true)
    try {
      const csv = await file.text()
      if (!csv.trim()) throw new Error("CSV file is empty")
      const res = await fetch(`${API_BASE}/api/ai-products/import-csv`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, csv }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Import failed" }))
        throw new Error(body.error || "Import failed")
      }
      const stats = await res.json()
      const details = Array.isArray(stats.errors) && stats.errors.length
        ? ` ${stats.errors.slice(0, 3).join(" • ")}${stats.errors.length > 3 ? ` • +${stats.errors.length - 3} more` : ""}`
        : ""
      toast({
        title: stats.failed ? (stats.success ? "Import partially complete" : "Import failed") : "Import complete",
        description: `${stats.success} added, ${stats.failed} failed.${details}`,
        variant: stats.failed ? "destructive" : "default",
      })
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] })
      setImporting(false)
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Import failed", variant: "destructive" })
    } finally { setImportingJob(false) }
  }

  async function exportXlsx() {
    if (!activeCompany) { toast({ title: "Select a company" }); return }
    try {
      const res = await fetch(`${API_BASE}/api/ai-products/export-xlsx`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id, ...(selectedIds.size ? { productIds: [...selectedIds] } : {}) }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `products-${activeCompany.id}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "Error", description: "Excel export failed", variant: "destructive" })
    }
  }

  const visibleProductIds = (data?.items || []).map((product: any) => Number(product.id))
  const allVisibleSelected = visibleProductIds.length > 0 && visibleProductIds.every((id: number) => selectedIds.has(id))

  function toggleSelectAll() {
    setSelectedIds(current => {
      const next = new Set(current)
      if (allVisibleSelected) visibleProductIds.forEach((id: number) => next.delete(id))
      else visibleProductIds.forEach((id: number) => next.add(id))
      return next
    })
  }

  function toggleProduct(id: number) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function importXlsx(file: File) {
    const companyId = Number(importCompanyId)
    if (!companyId) { toast({ title: "Select a company", variant: "destructive" }); return }
    setImportingJob(true)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      const res = await fetch(`${API_BASE}/api/ai-products/import-xlsx`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, base64 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Import failed" }))
        throw new Error(body.error || "Import failed")
      }
      const stats = await res.json()
      const details = Array.isArray(stats.errors) && stats.errors.length
        ? ` ${stats.errors.slice(0, 3).join(" • ")}${stats.errors.length > 3 ? ` • +${stats.errors.length - 3} more` : ""}`
        : ""
      toast({
        title: stats.failed ? (stats.success ? "Excel import partially complete" : "Excel import failed") : "Excel import complete",
        description: `${stats.success} added, ${stats.failed} failed.${details}`,
        variant: stats.failed ? "destructive" : "default",
      })
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] })
      setImporting(false)
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Excel import failed", variant: "destructive" })
    } finally { setImportingJob(false) }
  }

  async function generateBarcodeImage() {
    if (!editing?.id) { toast({ title: "Save the product first" }); return }
    setGeneratingBarcode(true)
    try {
      const res = await fetch(`${API_BASE}/api/ai-products/${editing.id}/barcode-image`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error()
      const { objectPath } = await res.json()
      setBarcodeImage(objectPath)
      toast({ title: "Barcode generated" })
    } catch {
      toast({ title: "Barcode generation failed", variant: "destructive" })
    } finally { setGeneratingBarcode(false) }
  }

  async function generateMarketplaceImages() {
    if (!editing?.id) { toast({ title: "Save the product first" }); return }
    setGeneratingMarketplace(true)
    try {
      const res = await fetch(`${API_BASE}/api/ai-products/${editing.id}/generate-marketplace-images`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIndex: 0 }),
      })
      if (!res.ok) throw new Error()
      const { results } = await res.json()
      toast({ title: "Marketplace images ready", description: `${results.length} variants generated` })
    } catch {
      toast({ title: "Marketplace image generation failed", variant: "destructive" })
    } finally { setGeneratingMarketplace(false) }
  }

  function addVariant() {
    setVariants(prev => [...prev, { sku: "", name: "", price: form.price || "0", stockQuantity: "0" }])
  }

  function updateVariant(i: number, key: keyof ProductVariant, value: string) {
    setVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [key]: value } : v))
  }

  function removeVariant(i: number) {
    setVariants(prev => prev.filter((_, idx) => idx !== i))
  }

  const f = (k: keyof ProductForm, v: string) => setForm(frm => ({ ...frm, [k]: v }))

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products & Inventory</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {activeCompany ? `${activeCompany.name} · ` : "All companies · "}
            {isLoading ? "Loading products…" : isError ? "Unable to load products" : `${data?.total ?? 0} products`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={openImport} className="gap-2"><Upload className="w-4 h-4" />Import CSV</Button>
          <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="w-4 h-4" />Export CSV</Button>
          <Button variant="outline" onClick={exportXlsx} className="gap-2" data-testid="button-export-xlsx"><FileSpreadsheet className="w-4 h-4" />Export Excel{selectedIds.size ? ` (${selectedIds.size})` : ""}</Button>
          <Button onClick={openQuickAdd} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-ai-drafts"><Sparkles className="w-4 h-4" />Create AI drafts</Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" />Add Product</Button>
        </div>
      </div>

      {/* Draft studio: analysis is intentionally separated from saving. */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" />Create product drafts from images</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Upload product photos, assign related angles to the same group, then ask AI to prepare editable drafts. You will review and save every product individually.
          </p>
          {!activeCompany && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={quickCompanyId} onValueChange={setQuickCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(companies) ? companies : []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><ImagePlus className="w-4 h-4" />Product photos</Label>
            <Input type="file" accept="image/*" multiple onChange={handleQuickImageUpload} disabled={uploadingProductImage || quickCreating || !quickCompanyId} data-testid="input-ai-images" />
            <p className="text-xs text-muted-foreground">Manually choose a group for each image. Each group becomes one draft (maximum 10 images per product).</p>
            {quickImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[350px] overflow-y-auto p-1">
                {quickImages.map((img, i) => (
                  <div key={img.key} className="relative rounded-lg border bg-card p-2 space-y-2">
                    <img src={img.preview} alt={`Uploaded product photo ${i + 1}`} className="w-full aspect-square rounded-md object-cover bg-muted" />
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1 right-1 bg-background/90 border rounded-full w-6 h-6 flex items-center justify-center"
                      onClick={() => setQuickImages(prev => prev.filter((_, j) => j !== i))}
                    ><X className="w-3.5 h-3.5" /></button>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs flex-1">Draft group</Label>
                      <Input
                        className="w-16 h-8"
                        type="number"
                        min="1"
                        max="20"
                        aria-label={`Group for photo ${i + 1}`}
                        value={img.group}
                        onChange={event => setQuickImages(current => current.map((item, index) => index === i ? { ...item, group: Math.max(1, Number(event.target.value) || 1) } : item))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)} disabled={quickCreating}>Cancel</Button>
            <Button
              onClick={handleQuickCreate}
              disabled={quickCreating || uploadingProductImage || !quickImages.length}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {quickCreating ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing drafts…</> : <><Wand2 className="w-4 h-4" />Analyze & review drafts</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search products…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
            </div>
            {selectedIds.size > 0 && <Badge variant="secondary" className="px-3" data-testid="status-selection">{selectedIds.size} selected</Badge>}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label="Select all visible products" data-testid="checkbox-select-all-products" />
                  </TableHead>
                  <TableHead className="w-14" />
                  <TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead>
                  <TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                )) : isError ? (
                  <TableRow><TableCell colSpan={9} className="h-40 text-center">
                    <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
                    <p className="font-medium">Products could not be loaded</p>
                    <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Please try again."}</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => refetch()}>
                      <RefreshCw className="h-4 w-4" />Retry
                    </Button>
                  </TableCell></TableRow>
                ) : data?.items?.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="h-32 text-center">
                    <PackageSearch className="mx-auto h-8 w-8 opacity-20 mb-2" />
                    <p className="text-muted-foreground">No products found</p>
                  </TableCell></TableRow>
                ) : data?.items?.map((p: any) => {
                  const lowStock = p.stockQuantity <= p.reorderLevel
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30" data-state={selectedIds.has(p.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleProduct(p.id)} aria-label={`Select ${p.name}`} data-testid={`checkbox-product-${p.id}`} />
                      </TableCell>
                      <TableCell className="pr-0">
                        {p.imageUrl ? (
                          <img
                            src={productImagePreview(p.imageUrl)}
                            alt={p.name}
                            className="w-10 h-10 rounded-md object-cover border border-border/50 bg-muted"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md border border-border/50 bg-muted flex items-center justify-center">
                            <PackageSearch className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span>{p.companyName}</span>
                          {p.sourceLink && (
                            <a href={p.sourceLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300" onClick={e => e.stopPropagation()}>
                              <Link className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                      <TableCell className="text-sm">{p.category ?? "—"}{p.subcategory ? ` · ${p.subcategory}` : ""}</TableCell>
                      <TableCell className="font-semibold">₹{Number(p.price).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {lowStock && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                          <span className={lowStock ? "text-yellow-400 font-medium" : ""}>{p.stockQuantity}</span>
                          <span className="text-xs text-muted-foreground">/ min {p.reorderLevel}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-xs capitalize">{p.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setAiProduct(p)}><Sparkles className="w-3.5 h-3.5 text-purple-500" /></Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" disabled={deleting === p.id} onClick={() => handleDelete(p.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {data && data.total > 20 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-5 border-b">
            <DialogTitle className="flex items-center gap-2">
              {editing ? "Edit Product" : "Add Product"}
              {draftQueue.length > 0 && <Badge variant="secondary">Review draft {draftIndex + 1} of {draftQueue.length}</Badge>}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Changes are not published until you save.</p>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-y-auto bg-muted/20 p-5">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-5">
              <div className="space-y-5">
                {autoFill && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 flex items-start justify-between gap-3">
                    <div><p className="text-sm font-medium flex items-center gap-2"><Wand2 className="w-4 h-4 text-purple-500" />AI draft ready for your review</p><p className="text-xs text-muted-foreground mt-1">Check every suggestion, price and SKU before saving.</p></div>
                    <Button size="sm" variant="outline" onClick={applyAutoFill}><Check className="w-3.5 h-3.5 mr-1" />Use suggestions</Button>
                  </div>
                )}
                <section className="rounded-xl border bg-card p-5 space-y-4" aria-labelledby="product-info-heading">
                  <div><h3 id="product-info-heading" className="font-semibold">Product information</h3><p className="text-xs text-muted-foreground">The title and description customers will see.</p></div>
                  <div className="space-y-1.5"><Label>Product name *</Label><Input value={form.name} onChange={e => f("name", e.target.value)} placeholder="Product name" data-testid="input-product-name" /></div>
                  <div className="space-y-1.5"><Label>Short description</Label><Input value={form.shortDescription} onChange={e => f("shortDescription", e.target.value)} placeholder="A concise product summary" /></div>
                  <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => f("description", e.target.value)} placeholder="Materials, features, care instructions…" rows={5} /></div>
                </section>

                <section className="rounded-xl border bg-card p-5 space-y-4" aria-labelledby="media-heading">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 id="media-heading" className="font-semibold">Media</h3><p className="text-xs text-muted-foreground">The first image is the main product thumbnail. Reorder or choose any image as main.</p></div>
                    <Label className="cursor-pointer" htmlFor="product-media-input"><Input id="product-media-input" className="sr-only" type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploadingProductImage || media.length >= 10 || !form.companyId} /><span className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"><ImagePlus className="w-4 h-4 mr-2" />Add images</span></Label>
                  </div>
                  {uploadingProductImage && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading images…</p>}
                  {media.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {media.map((image, index) => (
                        <div
                          key={image.key}
                          className={`group relative rounded-lg border p-2 ${index === 0 ? "ring-2 ring-primary/50" : ""}`}
                          draggable
                          onDragStart={event => event.dataTransfer.setData("text/product-image-index", String(index))}
                          onDragOver={event => event.preventDefault()}
                          onDrop={event => {
                            event.preventDefault()
                            const fromIndex = Number(event.dataTransfer.getData("text/product-image-index"))
                            if (Number.isInteger(fromIndex)) moveImageTo(fromIndex, index)
                          }}
                        >
                          <img src={image.preview} alt={`${form.name || "Product"} image ${index + 1}`} className="w-full aspect-square object-cover rounded-md bg-muted" />
                          {index === 0 && <Badge className="absolute top-3 left-3 gap-1"><Star className="w-3 h-3 fill-current" />Main</Badge>}
                          <Button type="button" size="icon" variant="secondary" className="absolute top-3 right-3 w-7 h-7" aria-label={`Remove image ${index + 1}`} onClick={() => removeImage(index)}><X className="w-3.5 h-3.5" /></Button>
                          <div className="flex items-center justify-between gap-1 pt-2">
                            <div className="flex gap-1">
                              <Button type="button" size="icon" variant="ghost" className="w-7 h-7" disabled={index === 0} aria-label={`Move image ${index + 1} left`} onClick={() => moveImage(index, -1)}><ArrowLeft className="w-3.5 h-3.5" /></Button>
                              <Button type="button" size="icon" variant="ghost" className="w-7 h-7" disabled={index === media.length - 1} aria-label={`Move image ${index + 1} right`} onClick={() => moveImage(index, 1)}><ArrowRight className="w-3.5 h-3.5" /></Button>
                            </div>
                            {index > 0 && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => makeMainImage(index)}>Make main</Button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <button type="button" className="w-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" onClick={() => document.getElementById("product-media-input")?.click()}><ImagePlus className="w-6 h-6 mx-auto mb-2 opacity-60" />Add up to 10 product images</button>}
                  {removedImageIds.length > 0 && <p className="text-xs text-muted-foreground">{removedImageIds.length} existing image{removedImageIds.length === 1 ? "" : "s"} will be removed only after you save.</p>}
                </section>

                <section className="rounded-xl border bg-card p-5 space-y-4" aria-labelledby="pricing-heading">
                  <h3 id="pricing-heading" className="font-semibold">Pricing</h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5"><Label>Sale price (₹) *</Label><Input value={form.price} onChange={e => f("price", e.target.value)} type="number" min="0" data-testid="input-product-price" /></div>
                    <div className="space-y-1.5"><Label>MRP (₹)</Label><Input value={form.mrp} onChange={e => f("mrp", e.target.value)} type="number" min="0" /></div>
                    <div className="space-y-1.5"><Label>Cost per item (₹)</Label><Input value={form.costPrice} onChange={e => f("costPrice", e.target.value)} type="number" min="0" /></div>
                  </div>
                  <div className="space-y-1.5 max-w-[200px]"><Label>GST (%)</Label><Input value={form.gst} onChange={e => f("gst", e.target.value)} type="number" min="0" /></div>
                </section>

                <section className="rounded-xl border bg-card p-5 space-y-4" aria-labelledby="inventory-heading">
                  <h3 id="inventory-heading" className="font-semibold">Inventory</h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5"><Label>SKU</Label><div className="flex gap-2"><Input value={form.sku} onChange={e => f("sku", e.target.value)} placeholder="Generated if blank" /><Button type="button" variant="outline" size="icon" onClick={generateSku} disabled={generatingSku} aria-label="Generate SKU"><ScanBarcode className="w-4 h-4" /></Button></div></div>
                    <div className="space-y-1.5"><Label>Stock quantity</Label><Input value={form.stockQuantity} onChange={e => f("stockQuantity", e.target.value)} type="number" min="0" /></div>
                    <div className="space-y-1.5"><Label>Reorder level</Label><Input value={form.reorderLevel} onChange={e => f("reorderLevel", e.target.value)} type="number" min="0" /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Warehouse location</Label><Input value={form.warehouseLocation} onChange={e => f("warehouseLocation", e.target.value)} placeholder="Warehouse A, rack 3" /></div>
                </section>

                <section className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                    <div><h3 className="font-semibold">Variants</h3><p className="text-xs text-muted-foreground">Optional sizes, colors or other choices.</p></div>
                <Button size="sm" variant="outline" onClick={addVariant} type="button">Add variant</Button>
              </div>
              {variants.length === 0 && <p className="text-xs text-muted-foreground">No variants yet</p>}
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end">
                  <Input placeholder="Variant name" value={v.name} onChange={e => updateVariant(i, "name", e.target.value)} />
                  <Input placeholder="SKU" value={v.sku} onChange={e => updateVariant(i, "sku", e.target.value)} />
                  <Input placeholder="Price" type="number" value={v.price} onChange={e => updateVariant(i, "price", e.target.value)} />
                  <div className="flex gap-2">
                    <Input placeholder="Stock" type="number" value={v.stockQuantity} onChange={e => updateVariant(i, "stockQuantity", e.target.value)} />
                    <Button size="icon" variant="ghost" onClick={() => removeVariant(i)} type="button"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
                </section>
              </div>

              <aside className="space-y-5">
                <section className="rounded-xl border bg-card p-5 space-y-4">
                  <h3 className="font-semibold">Status</h3>
                  <Select value={form.status} onValueChange={v => f("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
                  <div className="space-y-1.5"><Label>Company *</Label><Select value={form.companyId} onValueChange={v => f("companyId", v)}><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                </section>
                <section className="rounded-xl border bg-card p-5 space-y-4">
                  <div><h3 className="font-semibold">Organization</h3><p className="text-xs text-muted-foreground">Used for filtering and reporting.</p></div>
                  <div className="space-y-1.5"><Label>Brand</Label><Input value={form.brand} onChange={e => f("brand", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Category *</Label><Input value={form.category} onChange={e => f("category", e.target.value)} placeholder="e.g. Apparel" data-testid="input-product-category" /></div>
                  <div className="space-y-1.5"><Label>Subcategory</Label><Input value={form.subcategory} onChange={e => f("subcategory", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>HSN code</Label><Input value={form.hsn} onChange={e => f("hsn", e.target.value)} /></div>
                </section>
                <section className="rounded-xl border bg-card p-5 space-y-4">
                  <h3 className="font-semibold">Shipping</h3>
                  <div className="space-y-1.5"><Label>Weight</Label><Input value={form.weight} onChange={e => f("weight", e.target.value)} placeholder="e.g. 250g" /></div>
                  <div className="space-y-1.5"><Label>Dimensions</Label><Input value={form.dimensions} onChange={e => f("dimensions", e.target.value)} placeholder="L × W × H cm" /></div>
                </section>
                <section className="rounded-xl border bg-card p-5 space-y-3">
                  <Label className="flex items-center gap-1.5"><Link className="w-3.5 h-3.5" />Source / product URL</Label>
                  <div className="flex gap-2"><Input value={form.sourceLink} onChange={e => f("sourceLink", e.target.value)} placeholder="https://…" /><Button type="button" variant="outline" size="icon" aria-label="Generate product URL" onClick={() => f("sourceLink", autoGenerateSourceLink(form.name, form.sku))} disabled={!form.name && !form.sku}><RefreshCw className="w-4 h-4" /></Button></div>
                </section>
                {editing && (
                  <section className="rounded-xl border bg-card p-5 flex flex-col gap-2">
                <Button variant="outline" onClick={generateBarcodeImage} disabled={generatingBarcode} className="gap-2"><ScanBarcode className="w-4 h-4" /> {barcodeImage ? "Regenerate barcode" : "Generate barcode"}</Button>
                <Button variant="outline" onClick={generateMarketplaceImages} disabled={generatingMarketplace} className="gap-2"><ImagePlus className="w-4 h-4" /> Marketplace images</Button>
                    {barcodeImage && <img src={barcodeImage} alt="Barcode" className="h-16 object-contain border rounded-md p-1" />}
                  </section>
                )}
              </aside>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-background">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.category || !form.price || !form.companyId} data-testid="button-save-product">
              {saving ? "Saving…" : editing ? "Save changes" : draftQueue.length > draftIndex + 1 ? "Save & review next" : "Save product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aiProduct} onOpenChange={() => setAiProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>AI Assistant — {aiProduct?.name}</DialogTitle></DialogHeader>
          {aiProduct && <AiProductPanel product={aiProduct} onChange={() => { refetch() }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Import Products</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Import into company</Label>
              <Select value={importCompanyId} onValueChange={setImportCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(companies) ? companies : []).map((company: any) => (
                    <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-muted-foreground">Upload CSV or Excel. Columns: name, sku, brand, category, subcategory, description, shortDescription, price, mrp, costPrice, gst, stockQuantity, reorderLevel, weight, dimensions, hsn, warehouseLocation, status</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImporting(false)}>Cancel</Button>
            <Button
              onClick={() => { if (importFile) { importFile.name.endsWith(".xlsx") ? importXlsx(importFile) : importCsv(importFile); } }}
              disabled={importingJob || !importFile || !importCompanyId}
            >{importingJob ? "Importing…" : "Import"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
