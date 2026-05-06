"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  FileText,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Search,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getDocuments, deleteDocument, getAllocations, deallocateResources, checkStockLevels, getAggregatedResources, type Document } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useSSE } from "@/hooks/use-sse"
import { ResourceAllocationForm } from "@/components/resource-allocation-form"

export default function Dashboard() {
  const router = useRouter()
  const { token, isAuthenticated, loading: authLoading, user } = useAuth()
  const { toast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [resources, setResources] = useState<any>(null)
  const [hospitalName, setHospitalName] = useState<string>("Hospital Name")
  const [hospitalId, setHospitalId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [allocationLoading, setAllocationLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedDocForAllocation, setSelectedDocForAllocation] = useState<string | null>(null)
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const allocationSectionRef = useRef<HTMLDivElement>(null)
  const [isEditingHospitalName, setIsEditingHospitalName] = useState(false)
  const [editingHospitalName, setEditingHospitalName] = useState("")

  const { isConnected: sseConnected, on: onSSE } = useSSE(token)

  // SSE event handlers
  useEffect(() => {
    if (!token) return

    onSSE("document:completed", (data) => {
      console.log("📡 SSE: Document completed", data.documentId)
      fetchDocuments()
      toast({
        title: "Document Processed",
        description: data.message || "Document analysis completed",
      })
    })

    onSSE("document:failed", (data) => {
      console.log("📡 SSE: Document failed", data.documentId)
      fetchDocuments()
      toast({
        title: "Processing Failed",
        description: data.error || "Document processing failed",
        variant: "destructive",
      })
    })

    onSSE("allocation:created", (data) => {
      console.log("📡 SSE: Allocation created", data.allocation?._id)
      fetchAllocations()
      fetchResources()
      checkStock()
      toast({
        title: "Resources Allocated",
        description: data.message || "Resources allocated successfully",
      })
    })

    onSSE("allocation:deallocated", (data) => {
      console.log("📡 SSE: Allocation deallocated", data.allocation?._id)
      fetchAllocations()
      fetchResources()
      checkStock()
      toast({
        title: "Resources Deallocated",
        description: data.message || "Resources returned to inventory",
      })
    })

    onSSE("alert:low-stock", (data) => {
      console.log("📡 SSE: Low stock alert", data.items)
      checkStock()
      toast({
        title: "Low Stock Alert",
        description: data.message || "Some items are running low",
        variant: "destructive",
      })
    })
  }, [token, onSSE, toast])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/sign-in")
    }
  }, [isAuthenticated, authLoading, router])

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchDocuments()
      fetchAllocations()
      fetchResources()
      checkStock()
      
      // Set hospital info from user context
      if (user?.hospitalName) {
        setHospitalName(user.hospitalName)
      }
      if (user?.hospitalId) {
        setHospitalId(user.hospitalId)
      }
    }
  }, [isAuthenticated, token, user])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      if (!token) return

      const response = await getDocuments(token, { limit: 10 })
      if (response.success && response.data) {
        setDocuments(response.data.documents)
        
        // Extract hospital name from first document
        if (response.data.documents.length > 0) {
          const firstDoc = response.data.documents[0]
          if (firstDoc.extractedData?.hospitalName) {
            setHospitalName(firstDoc.extractedData.hospitalName)
          }
        }
        
        // Check localStorage for saved hospital name
        const savedHospitalName = localStorage.getItem('hospitalName')
        if (savedHospitalName) {
          setHospitalName(savedHospitalName)
        }
      }
    } catch (error) {
      console.error("Error fetching documents:", error)
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchResources = async () => {
    try {
      if (!token) return

      const response = await getAggregatedResources(token)
      if (response.success && response.data) {
        setResources(response.data)
      }
    } catch (error) {
      console.error("Error fetching resources:", error)
    }
  }

  const handleDelete = async (documentId: string) => {
    try {
      setDeleting(documentId)
      if (!token) return

      const response = await deleteDocument(token, documentId)
      if (response.success) {
        setDocuments((prev) => prev.filter((doc) => doc._id !== documentId))
        toast({
          title: "Success",
          description: "Document deleted successfully",
        })
      }
    } catch (error) {
      console.error("Error deleting document:", error)
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      })
    } finally {
      setDeleting(null)
    }
  }

  const fetchAllocations = async () => {
    try {
      setAllocationLoading(true)
      if (!token) return

      const response = await getAllocations(token, { limit: 20 })
      if (response.success && response.data) {
        setAllocations(response.data.allocations)
      }
    } catch (error) {
      console.error("Error fetching allocations:", error)
    } finally {
      setAllocationLoading(false)
    }
  }

  const checkStock = async () => {
    try {
      // Use aggregated resources data to check stock levels
      if (!resources || !resources.inventory) return

      const inventory = resources.inventory
      const alerts: any[] = []
      const threshold = 5

      // Check all inventory items for low stock
      if (inventory.general_beds !== undefined && inventory.general_beds < threshold) {
        alerts.push({
          item: 'General Beds',
          count: inventory.general_beds,
          threshold,
        })
      }
      if (inventory.icu_beds !== undefined && inventory.icu_beds < threshold) {
        alerts.push({
          item: 'ICU Beds',
          count: inventory.icu_beds,
          threshold,
        })
      }
      if (inventory.isolation_beds !== undefined && inventory.isolation_beds < threshold) {
        alerts.push({
          item: 'Isolation Beds',
          count: inventory.isolation_beds,
          threshold,
        })
      }
      if (inventory.ot_rooms !== undefined && inventory.ot_rooms < threshold) {
        alerts.push({
          item: 'OT Rooms',
          count: inventory.ot_rooms,
          threshold,
        })
      }
      if (inventory.saline !== undefined && inventory.saline < threshold) {
        alerts.push({
          item: 'Saline',
          count: inventory.saline,
          threshold,
        })
      }
      if (inventory.injections !== undefined && inventory.injections < threshold) {
        alerts.push({
          item: 'Injections',
          count: inventory.injections,
          threshold,
        })
      }
      if (inventory.antibodies !== undefined && inventory.antibodies < threshold) {
        alerts.push({
          item: 'Antibodies',
          count: inventory.antibodies,
          threshold,
        })
      }
      if (inventory.ecg_machines !== undefined && inventory.ecg_machines < threshold) {
        alerts.push({
          item: 'ECG Machines',
          count: inventory.ecg_machines,
          threshold,
        })
      }
      if (inventory.ct_scan !== undefined && inventory.ct_scan < threshold) {
        alerts.push({
          item: 'CT Scan',
          count: inventory.ct_scan,
          threshold,
        })
      }
      if (inventory.endoscopy !== undefined && inventory.endoscopy < threshold) {
        alerts.push({
          item: 'Endoscopy',
          count: inventory.endoscopy,
          threshold,
        })
      }
      if (inventory.bp_machines !== undefined && inventory.bp_machines < threshold) {
        alerts.push({
          item: 'BP Machines',
          count: inventory.bp_machines,
          threshold,
        })
      }
      if (inventory.ultrasonography !== undefined && inventory.ultrasonography < threshold) {
        alerts.push({
          item: 'Ultrasonography',
          count: inventory.ultrasonography,
          threshold,
        })
      }
      if (inventory.xray_machines !== undefined && inventory.xray_machines < threshold) {
        alerts.push({
          item: 'X-Ray Machines',
          count: inventory.xray_machines,
          threshold,
        })
      }
      if (inventory.medicines && Array.isArray(inventory.medicines)) {
        inventory.medicines.forEach((med: any) => {
          if (med.count < threshold) {
            alerts.push({
              item: `Medicine: ${med.name}`,
              count: med.count,
              threshold,
            })
          }
        })
      }
      if (inventory.instruments && Array.isArray(inventory.instruments)) {
        inventory.instruments.forEach((instrument: any) => {
          if (instrument.count < threshold) {
            alerts.push({
              item: `Instrument: ${instrument.name}`,
              count: instrument.count,
              threshold,
            })
          }
        })
      }
      if (inventory.other_equipment && Array.isArray(inventory.other_equipment)) {
        inventory.other_equipment.forEach((equipment: any) => {
          if (equipment.count < threshold) {
            alerts.push({
              item: equipment.name,
              count: equipment.count,
              threshold,
            })
          }
        })
      }

      setLowStockItems(alerts)

      // Show toast notification only if there are new alerts
      if (alerts.length > 0) {
        const itemsList = alerts
          .slice(0, 3)
          .map((item: any) => `${item.item}: ${item.count}`)
          .join(", ")

        toast({
          title: "⚠️ Low Stock Alert",
          description: `${itemsList}${alerts.length > 3 ? " and more" : ""}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error checking stock:", error)
    }
  }

  const handleDeallocate = async (allocationId: string) => {
    try {
      if (!token) return

      const response = await deallocateResources(token, allocationId)
      if (response.success) {
        // Refresh all data after deallocation
        setTimeout(() => {
          fetchAllocations()
          checkStock()
          fetchDocuments()
          fetchResources()
        }, 500)
        toast({
          title: "Success",
          description: "Resources deallocated successfully",
        })
      }
    } catch (error) {
      console.error("Error deallocating:", error)
      toast({
        title: "Error",
        description: "Failed to deallocate resources",
        variant: "destructive",
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleStartEditHospitalName = () => {
    setEditingHospitalName(hospitalName)
    setIsEditingHospitalName(true)
  }

  const handleSaveHospitalName = () => {
    if (editingHospitalName.trim()) {
      setHospitalName(editingHospitalName.trim())
      localStorage.setItem('hospitalName', editingHospitalName.trim())
      setIsEditingHospitalName(false)
      toast({
        title: "Success",
        description: "Hospital name updated",
      })
    }
  }

  const handleCancelEditHospitalName = () => {
    setIsEditingHospitalName(false)
    setEditingHospitalName("")
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {isEditingHospitalName ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editingHospitalName}
                  onChange={(e) => setEditingHospitalName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveHospitalName()
                    } else if (e.key === 'Escape') {
                      handleCancelEditHospitalName()
                    }
                  }}
                  className="text-4xl font-bold text-foreground bg-background border-2 border-primary rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter hospital name"
                  aria-label="Hospital name"
                  title="Hospital name"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveHospitalName}
                  className="h-8 w-8"
                >
                  <Check className="w-4 h-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelEditHospitalName}
                  className="h-8 w-8"
                >
                  <X className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-4xl font-bold text-foreground">{hospitalName}</h1>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartEditHospitalName}
                  className="h-8 w-8"
                  title="Edit hospital name"
                >
                  <Edit2 className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-muted-foreground">
              Resource Management & Patient Allocation System
            </p>
            {hospitalId && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Hospital ID:</span> <span className="font-mono bg-muted px-2 py-1 rounded">{hospitalId}</span>
              </p>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Documents Processed</CardTitle>
                <FileText className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{documents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Total uploaded PDFs</p>
            </CardContent>
          </Card>

          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Successfully Processed</CardTitle>
                <FileText className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {documents.filter(d => d.processingStatus === 'completed').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Completed with AI Agent analysis</p>
            </CardContent>
          </Card>
        </div>

        {/* Processed Documents */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Processed Medical Documents</CardTitle>
            <CardDescription>
              PDF documents processed with OCR and extracted medical data
            </CardDescription>
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by Patient ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your first PDF document to get started
                </p>
                <Button asChild>
                  <a href="/upload">Upload Document</a>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const filtered = documents.filter((doc) => {
                    const patientId = doc.extractedData?.patientInfo?.id || doc.extractedData?.patientId || ""
                    return patientId.toLowerCase().includes(searchQuery.toLowerCase())
                  })

                  return filtered.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No documents found matching Patient ID "{searchQuery}"</p>
                    </div>
                  ) : (
                    filtered.map((doc) => {
                      const isExpanded = expandedDocs.has(doc._id)
                      const patientName = doc.extractedData?.patientInfo?.name || doc.extractedData?.patientName || "Unknown"
                      const patientId = doc.extractedData?.patientInfo?.id || doc.extractedData?.patientId || "N/A"
                      const diagnosis = doc.extractedData?.diagnosis || doc.extractedData?.medicalConditions?.[0] || "Not specified"

                      return (
                        <div
                          key={doc._id}
                          className="p-4 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
                        >
                          {/* Collapsed View */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                              <FileText className="w-8 h-8 text-primary mt-1 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-foreground truncate">{doc.fileName}</h4>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                                  <span>Patient: <span className="font-medium text-foreground">{patientName}</span></span>
                                  <span>•</span>
                                  <span>ID: <span className="font-medium text-foreground">{patientId}</span></span>
                                </div>
                                <div className="mt-2">
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium">Diagnosis:</span> {diagnosis}
                                  </p>
                                </div>
                                <div className="mt-2">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      doc.processingStatus === "completed"
                                        ? "bg-green-500/20 text-green-600"
                                        : doc.processingStatus === "processing"
                                          ? "bg-blue-500/20 text-blue-600"
                                          : doc.processingStatus === "failed"
                                            ? "bg-destructive/20 text-destructive"
                                            : "bg-yellow-500/20 text-yellow-600"
                                    }`}
                                  >
                                    {doc.processingStatus === "completed" && `✓ Completed (${doc.ocrConfidence}% confidence)`}
                                    {doc.processingStatus === "processing" && "⏳ Processing..."}
                                    {doc.processingStatus === "failed" && "✗ Failed"}
                                    {doc.processingStatus === "pending" && "⏸ Pending"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {doc.processingStatus === "completed" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setExpandedDocs(prev => {
                                        const next = new Set(prev)
                                        if (next.has(doc._id)) next.delete(doc._id)
                                        else next.add(doc._id)
                                        return next
                                      })
                                    }}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedDocForAllocation(doc._id)
                                      setTimeout(() => {
                                        allocationSectionRef.current?.scrollIntoView({ behavior: "smooth" })
                                      }, 100)
                                    }}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    Allocate
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(doc._id)}
                                disabled={deleting === doc._id}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                {deleting === doc._id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Expanded View */}
                          {isExpanded && doc.processingStatus === "completed" && doc.extractedData && (
                            <div className="mt-4 pt-4 border-t border-border space-y-3">
                              <p className="text-xs font-semibold text-foreground">Extracted Medical Information:</p>
                              
                              {/* Hospital Name */}
                              {doc.extractedData.hospitalName && (
                                <div className="pb-3 border-b border-border">
                                  <p className="text-xs text-muted-foreground font-medium mb-1">Hospital:</p>
                                  <p className="text-sm font-semibold text-foreground">{doc.extractedData.hospitalName}</p>
                                </div>
                              )}
                              
                              {/* Doctor Name */}
                              {(doc.extractedData.doctorName || doc.extractedData.physicianName) && (
                                <div className="pb-3 border-b border-border">
                                  <p className="text-xs text-muted-foreground font-medium mb-1">Doctor:</p>
                                  <p className="text-sm font-semibold text-foreground">{doc.extractedData.doctorName || doc.extractedData.physicianName}</p>
                                </div>
                              )}
                              
                              {/* Medications/Medicines */}
                              {doc.extractedData.medications && doc.extractedData.medications.length > 0 && (
                                <div className="pb-3 border-b border-border">
                                  <p className="text-xs text-muted-foreground font-medium mb-2">Medications:</p>
                                  <div className="space-y-2">
                                    {doc.extractedData.medications.map((med, idx) => {
                                      const medName = typeof med === 'string' ? med : (med as any)?.name || JSON.stringify(med);
                                      const medDosage = typeof med === 'string' ? '' : (med as any)?.dosage;
                                      const medFreq = typeof med === 'string' ? '' : (med as any)?.frequency;
                                      return (
                                        <div key={idx} className="text-xs bg-emerald-500/10 p-2 rounded">
                                          <p className="text-foreground font-semibold">{medName}</p>
                                          {medDosage && <p className="text-muted-foreground">Dosage: {medDosage}</p>}
                                          {medFreq && <p className="text-muted-foreground">Frequency: {medFreq}</p>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Test Results */}
                              {doc.extractedData.testResults && doc.extractedData.testResults.length > 0 && (
                                <div className="pb-3 border-b border-border">
                                  <p className="text-xs text-muted-foreground font-medium mb-2">Test Results:</p>
                                  <div className="space-y-1">
                                    {doc.extractedData.testResults.map((test, idx) => (
                                      <div key={idx} className="text-xs bg-blue-500/10 p-2 rounded">
                                        <p className="text-foreground font-semibold">{(test as any)?.testName || 'Test'}</p>
                                        <p className="text-muted-foreground">Value: {(test as any)?.value} {(test as any)?.unit || ''}</p>
                                        {(test as any)?.referenceRange && <p className="text-muted-foreground">Ref: {(test as any)?.referenceRange}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Medical Conditions */}
                              {doc.extractedData.medicalConditions && doc.extractedData.medicalConditions.length > 0 && (
                                <div className="pb-3 border-b border-border">
                                  <p className="text-xs text-muted-foreground font-medium mb-2">Medical Conditions:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {doc.extractedData.medicalConditions.map((condition, idx) => {
                                      const condText = typeof condition === 'string' ? condition : (condition as any)?.name || JSON.stringify(condition);
                                      return (
                                        <span key={idx} className="bg-red-500/10 text-red-600 px-2 py-1 rounded text-xs">
                                          {condText}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Full Text Preview */}
                              {doc.ocrText && (
                                <div className="pt-2">
                                  <p className="text-xs font-semibold text-foreground mb-1">Full Text Preview:</p>
                                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap bg-muted/50 p-2 rounded">
                                    {doc.ocrText.substring(0, 300)}
                                    {doc.ocrText.length > 300 && "..."}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {doc.processingStatus === "failed" && doc.errorMessage && (
                            <p className="mt-2 text-xs text-destructive">{doc.errorMessage}</p>
                          )}
                        </div>
                      )
                    })
                  )
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Inventory */}
        {resources && resources.inventory && (
          <Card className="border-border mt-8 mb-8">
            <CardHeader>
              <CardTitle>Current Inventory Status</CardTitle>
              <CardDescription>Synced with Resources Page</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {resources.inventory.general_beds !== undefined && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-1">General Beds</p>
                    <p className="text-2xl font-bold text-foreground">{resources.inventory.general_beds}</p>
                  </div>
                )}
                {resources.inventory.icu_beds !== undefined && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-1">ICU Beds</p>
                    <p className="text-2xl font-bold text-foreground">{resources.inventory.icu_beds}</p>
                  </div>
                )}
                {resources.inventory.isolation_beds !== undefined && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Isolation Beds</p>
                    <p className="text-2xl font-bold text-foreground">{resources.inventory.isolation_beds}</p>
                  </div>
                )}
                {resources.inventory.ot_rooms !== undefined && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-1">OT Rooms</p>
                    <p className="text-2xl font-bold text-foreground">{resources.inventory.ot_rooms}</p>
                  </div>
                )}
                {resources.inventory.other_equipment && Array.isArray(resources.inventory.other_equipment) && (
                  resources.inventory.other_equipment.map((equipment: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg bg-muted/50 border border-border">
                      <p className="text-xs text-muted-foreground font-medium mb-1">{equipment.name}</p>
                      <p className="text-2xl font-bold text-foreground">{equipment.count}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Low Stock Alerts */}
        {lowStockItems.length > 0 && (
          <Card className="border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20 mt-8 mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="w-5 h-5" />
                Low Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lowStockItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border border-orange-200 dark:border-orange-800">
                    <div className="text-sm">
                      <p className="font-medium text-foreground">{item.item}</p>
                      <p className="text-xs text-muted-foreground">Current: {item.count} (Threshold: {item.threshold})</p>
                    </div>
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resource Allocation Form */}
        <div ref={allocationSectionRef}>
          {selectedDocForAllocation && token && (
            <div className="mt-8 mb-8">
              <Button 
                variant="outline" 
                onClick={() => setSelectedDocForAllocation(null)}
                className="mb-4"
              >
                Cancel Allocation
              </Button>
              {documents.find(d => d._id === selectedDocForAllocation) && (
                <ResourceAllocationForm
                  document={documents.find(d => d._id === selectedDocForAllocation)!}
                  token={token}
                  onSuccess={() => {
                    setSelectedDocForAllocation(null)
                    // Refresh all data after allocation
                    setTimeout(() => {
                      fetchAllocations()
                      checkStock()
                      fetchDocuments()
                      fetchResources()
                    }, 500)
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Allocated Resources */}
        <Card className="border-border mt-8">
          <CardHeader>
            <CardTitle>Allocated Resources</CardTitle>
            <CardDescription>Hospital resources allocated to patients</CardDescription>
          </CardHeader>
          <CardContent>
            {allocationLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : allocations.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No allocations yet</h3>
                <p className="text-sm text-muted-foreground">Upload prescriptions and allocate resources for patients</p>
              </div>
            ) : (
              <div className="space-y-4">
                {allocations.map((allocation: any) => (
                  <div
                    key={allocation._id}
                    className="p-4 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-foreground">
                            {allocation.patientInfo?.name || "Unknown Patient"}
                          </h4>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            allocation.status === 'allocated' ? 'bg-green-500/20 text-green-600' :
                            allocation.status === 'pending' ? 'bg-yellow-500/20 text-yellow-600' :
                            'bg-red-500/20 text-red-600'
                          }`}>
                            {allocation.status === 'allocated' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                            {allocation.status.charAt(0).toUpperCase() + allocation.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Age: {allocation.patientInfo?.age || "N/A"} | Gender: {allocation.patientInfo?.gender || "N/A"}
                        </p>
                      </div>
                      {allocation.status === 'allocated' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeallocate(allocation._id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Deallocate
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 p-3 bg-background rounded border border-border space-y-2">
                      <p className="text-xs font-semibold text-foreground mb-2">Allocated Resources:</p>
                      
                      {allocation.allocatedResources?.beds && (
                        <div className="text-xs">
                          <p className="text-muted-foreground">
                            <span className="font-medium">Beds:</span> {allocation.allocatedResources.beds.quantity}x {allocation.allocatedResources.beds.bedType}
                          </p>
                        </div>
                      )}
                      
                      {allocation.allocatedResources?.oxygenCylinders?.quantity > 0 && (
                        <div className="text-xs">
                          <p className="text-muted-foreground">
                            <span className="font-medium">Oxygen Cylinders:</span> {allocation.allocatedResources.oxygenCylinders.quantity}
                          </p>
                        </div>
                      )}
                      
                      {allocation.allocatedResources?.dialysis && allocation.allocatedResources.dialysis.sessions > 0 && (
                        <div className="text-xs">
                          <p className="text-muted-foreground">
                            <span className="font-medium">Dialysis:</span> {allocation.allocatedResources.dialysis.sessions} sessions ({allocation.allocatedResources.dialysis.frequency})
                          </p>
                        </div>
                      )}

                      {allocation.prescriptionDetails?.doctorName && (
                        <div className="text-xs">
                          <p className="text-muted-foreground">
                            <span className="font-medium">Doctor:</span> {allocation.prescriptionDetails.doctorName}
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      Allocated: {new Date(allocation.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
