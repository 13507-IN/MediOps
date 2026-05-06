"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Upload, FileText, Loader2, Calendar, Users, Package, Activity, X, Stethoscope, Heart, Syringe, Building2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { uploadResourcePDF, getAggregatedResources } from "@/lib/api"
import { useSSE } from "@/hooks/use-sse"

interface AggregatedResourceData {
  doctors: Array<{ name: string; available_days: string; time: string }>;
  nurses: Array<{ name: string; available_days: string; time: string }>;
  inventory: {
    medicines: Array<{ name: string; count: number }>;
    saline: number;
    injections: number;
    antibodies: number;
    ot_rooms: number;
    general_beds: number;
    available_nurses_count: number;
    instruments: Array<{ name: string; count: number }>;
    ecg_machines: number;
    ct_scan: number;
    endoscopy: number;
    bp_machines: number;
    ultrasonography: number;
    xray_machines: number;
    other_equipment: Array<{ name: string; count: number }>;
  };
  resources: Array<{ _id: string; fileName: string; createdAt: string; updatedAt: string }>;
}

export default function Resources() {
  const router = useRouter()
  const { token, isAuthenticated, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [resourceData, setResourceData] = useState<AggregatedResourceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const { isConnected: sseConnected, on: onSSE } = useSSE(token)

  // SSE event handlers for real-time resource processing
  useEffect(() => {
    if (!token) return

    onSSE("resource:completed", (data) => {
      console.log("📡 SSE: Resource completed", data.resourceId)
      fetchAggregatedResources()
      setUploading(false)
      toast({
        title: "Resource Analyzed",
        description: data.message || "Resource PDF processed successfully",
      })
    })

    onSSE("resource:failed", (data) => {
      console.log("📡 SSE: Resource failed", data.resourceId)
      setUploading(false)
      toast({
        title: "Processing Failed",
        description: data.error || "Resource analysis failed",
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

  // Fetch aggregated resources on mount
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAggregatedResources()
    }
  }, [isAuthenticated, token])

  const fetchAggregatedResources = async () => {
    try {
      setLoading(true)
      if (!token) return

      const response = await getAggregatedResources(token)
      if (response.success && response.data) {
        setResourceData(response.data)
      }
    } catch (error) {
      console.error("Error fetching resources:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const validTypes = ["application/pdf", "application/x-pdf"]
      const isValidType = validTypes.includes(file.type) || file.name.toLowerCase().endsWith('.pdf')
      
      if (!isValidType) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive",
        })
        return
      }
      setSelectedFile(file)
      setShowUploadModal(true)
    }
  }

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !token) {
      toast({
        title: "Error",
        description: "No file selected or not authenticated",
        variant: "destructive",
      })
      return
    }

    setUploading(true)
    setShowUploadModal(false)

    toast({
      title: "Uploading...",
      description: "Extracting data...",
    })

    try {
      const response = await uploadResourcePDF(token, selectedFile)
      
      if (!response.success) {
        throw new Error(response.message || "Upload failed")
      }

      toast({
        title: "Upload Successful",
        description: "Resource PDF uploaded. AI analysis in progress...",
      })

      setSelectedFile(null)
      // SSE will handle completion and refresh automatically
    } catch (error) {
      console.error("Upload error:", error)
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload resource PDF",
        variant: "destructive",
      })
      setUploading(false)
    }
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

  const hasData = resourceData && (
    (resourceData.doctors && resourceData.doctors.length > 0) ||
    (resourceData.nurses && resourceData.nurses.length > 0) ||
    (resourceData.inventory && (
      (resourceData.inventory.medicines && resourceData.inventory.medicines.length > 0) ||
      resourceData.inventory.saline > 0 ||
      resourceData.inventory.injections > 0 ||
      resourceData.inventory.antibodies > 0 ||
      resourceData.inventory.ot_rooms > 0 ||
      resourceData.inventory.general_beds > 0 ||
      resourceData.inventory.available_nurses_count > 0 ||
      (resourceData.inventory.instruments && resourceData.inventory.instruments.length > 0) ||
      resourceData.inventory.ecg_machines > 0 ||
      resourceData.inventory.ct_scan > 0 ||
      resourceData.inventory.endoscopy > 0 ||
      resourceData.inventory.bp_machines > 0 ||
      resourceData.inventory.ultrasonography > 0 ||
      resourceData.inventory.xray_machines > 0 ||
      (resourceData.inventory.other_equipment && resourceData.inventory.other_equipment.length > 0)
    ))
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Upload Button */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Resource Management</h1>
            <p className="text-muted-foreground">Manage hospital resources, staff, and inventory</p>
          </div>
          <Button
            onClick={handleUploadClick}
            disabled={uploading || !isAuthenticated}
            className="flex items-center gap-2"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting data...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload PDF
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </div>

        {/* Upload Modal */}
        {showUploadModal && selectedFile && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Upload Resource PDF</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowUploadModal(false)
                      setSelectedFile(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
            </div>
                <CardDescription>
                  File: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This PDF will be analyzed to extract doctor schedules, nurse availability, and inventory counts.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-1"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Upload & Analyze"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUploadModal(false)
                      setSelectedFile(null)
                    }}
                    disabled={uploading}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Resource Dashboard */}
        {!loading && hasData && resourceData && (
          <div className="space-y-6">
            {/* Last Updated */}
            {resourceData.resources && resourceData.resources.length > 0 && (
              <Card className="border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Last updated: {formatDate(resourceData.resources[0].updatedAt)} • 
                      {resourceData.resources.length} resource{resourceData.resources.length !== 1 ? 's' : ''} uploaded
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Doctors Section */}
            {resourceData.doctors && resourceData.doctors.length > 0 && (
              <Card className="border-border">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-primary" />
                    <CardTitle>Doctors</CardTitle>
                  </div>
                  <CardDescription>Doctor schedules and availability</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-medium text-foreground">Name</th>
                          <th className="text-left py-3 px-4 font-medium text-foreground">Available Days</th>
                          <th className="text-left py-3 px-4 font-medium text-foreground">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceData.doctors.map((doctor, index) => (
                          <tr key={index} className="border-b border-border hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-4 text-foreground font-medium">{doctor.name || "N/A"}</td>
                            <td className="py-3 px-4 text-muted-foreground">{doctor.available_days || "N/A"}</td>
                            <td className="py-3 px-4 text-muted-foreground">{doctor.time || "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Nurses Section */}
            {resourceData.nurses && resourceData.nurses.length > 0 && (
              <Card className="border-border">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-primary" />
                    <CardTitle>Nurses</CardTitle>
                  </div>
                  <CardDescription>Nurse schedules and availability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-foreground">Name</th>
                          <th className="text-left py-3 px-4 font-medium text-foreground">Available Days</th>
                          <th className="text-left py-3 px-4 font-medium text-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                        {resourceData.nurses.map((nurse, index) => (
                          <tr key={index} className="border-b border-border hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-4 text-foreground font-medium">{nurse.name || "N/A"}</td>
                            <td className="py-3 px-4 text-muted-foreground">{nurse.available_days || "N/A"}</td>
                            <td className="py-3 px-4 text-muted-foreground">{nurse.time || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
            )}

            {/* Inventory Section */}
            {resourceData.inventory && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Medicines */}
                {resourceData.inventory.medicines && resourceData.inventory.medicines.length > 0 && (
        <Card className="border-border">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        <CardTitle>Medicines</CardTitle>
            </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {resourceData.inventory.medicines.map((med, index) => (
                          <div 
                            key={index} 
                            className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border"
                          >
                            <span className="text-foreground font-medium">{med.name || "Unknown"}</span>
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                              {med.count || 0}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Basic Supplies */}
                <Card className="border-border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Syringe className="h-5 w-5 text-primary" />
                      <CardTitle>Basic Supplies</CardTitle>
                    </div>
          </CardHeader>
          <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground font-medium">Saline</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                          {resourceData.inventory.saline ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground font-medium">Injections</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                          {resourceData.inventory.injections ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground font-medium">Antibodies</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                          {resourceData.inventory.antibodies ?? 0}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Facilities */}
                <Card className="border-border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <CardTitle>Facilities</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground font-medium">OT Rooms</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                          {resourceData.inventory.ot_rooms ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground font-medium">General Beds</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                          {resourceData.inventory.general_beds ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground font-medium">Available Nurses</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                          {resourceData.inventory.available_nurses_count ?? 0}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Medical Equipment */}
                <Card className="border-border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      <CardTitle>Medical Equipment</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground text-sm font-medium">ECG Machines</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-semibold text-xs">
                          {resourceData.inventory.ecg_machines ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground text-sm font-medium">CT Scan</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-semibold text-xs">
                          {resourceData.inventory.ct_scan ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground text-sm font-medium">Endoscopy</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-semibold text-xs">
                          {resourceData.inventory.endoscopy ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground text-sm font-medium">BP Machines</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-semibold text-xs">
                          {resourceData.inventory.bp_machines ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground text-sm font-medium">Ultrasonography</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-semibold text-xs">
                          {resourceData.inventory.ultrasonography ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-foreground text-sm font-medium">X-Ray Machines</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-semibold text-xs">
                          {resourceData.inventory.xray_machines ?? 0}
                        </span>
                  </div>
            </div>
          </CardContent>
        </Card>
              </div>
            )}

            {/* Instruments and Other Equipment */}
            {((resourceData.inventory.instruments && resourceData.inventory.instruments.length > 0) ||
              (resourceData.inventory.other_equipment && resourceData.inventory.other_equipment.length > 0)) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Instruments */}
                {resourceData.inventory.instruments && resourceData.inventory.instruments.length > 0 && (
                  <Card className="border-border">
                    <CardHeader>
                      <CardTitle>Medical Instruments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {resourceData.inventory.instruments.map((instrument, index) => (
                          <div 
                            key={index} 
                            className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border"
                          >
                            <span className="text-foreground font-medium">{instrument.name || "Unknown"}</span>
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                              {instrument.count || 0}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Other Equipment */}
                {resourceData.inventory.other_equipment && resourceData.inventory.other_equipment.length > 0 && (
                  <Card className="border-border">
                    <CardHeader>
                      <CardTitle>Other Equipment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {resourceData.inventory.other_equipment.map((equipment, index) => (
                          <div 
                            key={index} 
                            className="flex justify-between items-center p-3 rounded-lg bg-muted/50 border border-border"
                          >
                            <span className="text-foreground font-medium">{equipment.name || "Unknown"}</span>
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold text-sm">
                              {equipment.count || 0}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* No Resource State */}
        {!loading && !hasData && (
          <Card className="border-border">
            <CardContent className="pt-12 pb-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No resources uploaded yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload your first resource PDF to get started
              </p>
              <Button onClick={handleUploadClick} size="lg">
                <Upload className="mr-2 h-4 w-4" />
                Upload Resource PDF
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
