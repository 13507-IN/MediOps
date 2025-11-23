"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { createAllocation, type Document, type AllocatedResources, type PrescriptionDetails, type PatientInfo } from "@/lib/api"
import { Loader2, AlertCircle } from "lucide-react"

interface ResourceAllocationFormProps {
  document: Document
  token: string
  onSuccess?: () => void
}

export function ResourceAllocationForm({
  document,
  token,
  onSuccess,
}: ResourceAllocationFormProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<{
    patientInfo: PatientInfo
    prescriptionDetails: PrescriptionDetails
    allocatedResources: AllocatedResources
  }>({
    patientInfo: {
      name: (document.extractedData?.patientInfo?.name || document.extractedData?.patientName) as string,
      age: (document.extractedData?.patientInfo?.age || document.extractedData?.patientAge) as string,
      gender: (document.extractedData?.patientInfo?.gender || document.extractedData?.patientGender) as string,
      id: (document.extractedData?.patientInfo?.id || document.extractedData?.patientId) as string,
    },
    prescriptionDetails: {
      doctorName: (document.extractedData?.doctorName || document.extractedData?.physicianName) as string,
      diagnosis: document.extractedData?.diagnosis as string,
    },
    allocatedResources: {
      beds: { bedType: "general", quantity: 1 },
      oxygenCylinders: { quantity: 0 },
      dialysis: { sessions: 0, frequency: "none" },
      otherServices: [],
    },
  })

  const handleSubmit = async () => {
    try {
      setLoading(true)

      // Validate required fields
      if (!formData.patientInfo.name) {
        toast({
          title: "Error",
          description: "Patient name is required",
          variant: "destructive",
        })
        return
      }

      const response = await createAllocation(token, {
        documentId: document._id,
        patientInfo: formData.patientInfo,
        prescriptionDetails: formData.prescriptionDetails,
        allocatedResources: formData.allocatedResources,
      })

      if (response.success) {
        toast({
          title: "Success",
          description: "Resources allocated successfully",
        })

        // Show low stock alerts if any
        if (response.data?.lowStockAlerts && response.data.lowStockAlerts.length > 0) {
          toast({
            title: "⚠️ Low Stock Alert",
            description: `${response.data.lowStockAlerts
              .map((item) => `${item.item}: ${item.remaining} remaining`)
              .join(", ")}`,
            variant: "destructive",
          })
        }

        onSuccess?.()
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to allocate resources",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Allocation error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to allocate resources",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Allocate Hospital Resources
        </CardTitle>
        <CardDescription>
          Allocate beds, oxygen cylinders, and other resources for this patient
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Patient Information Section */}
        <div className="space-y-3 p-3 bg-muted/50 rounded">
          <h3 className="font-semibold text-foreground">Patient Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-medium text-foreground">{formData.patientInfo.name || "Not provided"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Age</p>
              <p className="font-medium text-foreground">{formData.patientInfo.age || "Not provided"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gender</p>
              <p className="font-medium text-foreground">{formData.patientInfo.gender || "Not provided"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Patient ID</p>
              <p className="font-medium text-foreground">{formData.patientInfo.id || "Not provided"}</p>
            </div>
          </div>
        </div>

        {/* Doctor Information */}
        <div className="space-y-3 p-3 bg-muted/50 rounded">
          <h3 className="font-semibold text-foreground">Prescription Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Doctor Name</p>
              <p className="font-medium text-foreground">{formData.prescriptionDetails.doctorName || "Not provided"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Diagnosis</p>
              <p className="font-medium text-foreground">{formData.prescriptionDetails.diagnosis || "Not provided"}</p>
            </div>
          </div>
        </div>

        {/* Resource Allocation Section */}
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">Allocate Resources</h3>

          {/* Beds */}
          <div className="p-3 border border-border rounded space-y-3">
            <h4 className="font-medium text-sm">Hospital Beds</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-muted-foreground text-xs">Bed Type</label>
                <select
                  value={formData.allocatedResources.beds?.bedType || "general"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      allocatedResources: {
                        ...formData.allocatedResources,
                        beds: {
                          ...formData.allocatedResources.beds,
                          bedType: e.target.value,
                        } as any,
                      },
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-border bg-background text-foreground text-sm"
                >
                  <option value="general">General</option>
                  <option value="icu">ICU</option>
                  <option value="isolation">Isolation</option>
                </select>
              </div>
              <div>
                <label className="text-muted-foreground text-xs">Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={formData.allocatedResources.beds?.quantity || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      allocatedResources: {
                        ...formData.allocatedResources,
                        beds: {
                          ...formData.allocatedResources.beds,
                          quantity: parseInt(e.target.value) || 0,
                        } as any,
                      },
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-border bg-background text-foreground text-sm"
                />
              </div>
            </div>
          </div>

          {/* Oxygen Cylinders */}
          <div className="p-3 border border-border rounded space-y-3">
            <h4 className="font-medium text-sm">Oxygen Cylinders</h4>
            <div>
              <label className="text-muted-foreground text-xs">Quantity</label>
              <input
                type="number"
                min="0"
                value={formData.allocatedResources.oxygenCylinders?.quantity || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    allocatedResources: {
                      ...formData.allocatedResources,
                      oxygenCylinders: {
                        quantity: parseInt(e.target.value) || 0,
                      },
                    },
                  })
                }
                className="w-full px-2 py-1 rounded border border-border bg-background text-foreground text-sm"
              />
            </div>
          </div>

          {/* Dialysis */}
          <div className="p-3 border border-border rounded space-y-3">
            <h4 className="font-medium text-sm">Dialysis</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-muted-foreground text-xs">Sessions</label>
                <input
                  type="number"
                  min="0"
                  value={formData.allocatedResources.dialysis?.sessions || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      allocatedResources: {
                        ...formData.allocatedResources,
                        dialysis: {
                          ...formData.allocatedResources.dialysis,
                          sessions: parseInt(e.target.value) || 0,
                        } as any,
                      },
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-border bg-background text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs">Frequency</label>
                <select
                  value={formData.allocatedResources.dialysis?.frequency || "none"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      allocatedResources: {
                        ...formData.allocatedResources,
                        dialysis: {
                          ...formData.allocatedResources.dialysis,
                          frequency: e.target.value,
                        } as any,
                      },
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-border bg-background text-foreground text-sm"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="3times">3 times/week</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Alert for low stock */}
          <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded text-sm text-orange-700 dark:text-orange-400">
            <p className="font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Stock Alert
            </p>
            <p className="text-xs mt-1">Resources with count &lt; 5 will trigger a low stock alert after allocation</p>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4 border-t border-border">
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Allocating Resources...
              </>
            ) : (
              "Allocate Resources"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
