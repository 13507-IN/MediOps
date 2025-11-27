const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export interface Document {
  _id: string;
  userId: string;
  userEmail: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  ocrText: string;
  ocrConfidence: number;
  extractedData: {
    documentType?: string;
    patientInfo?: {
      name?: string;
      age?: string | number;
      gender?: string;
      id?: string;
    };
    medicalConditions?: string[];
    medications?: {
      name?: string;
      dosage?: string;
      frequency?: string;
    }[];
    testResults?: {
      testName?: string;
      value?: string | number;
      unit?: string;
      referenceRange?: string;
    }[];
    dates?: Array<string | { date?: string; context?: string }>;
    emails?: string[];
    phones?: string[];
    medicalTerms?: Array<string | { term?: string; explanation?: string }>;
    numbers?: Array<string | number>;
    summary?: string;
    criticalFindings?: string[];
    confidence?: string;
    [key: string]: any;
  };
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  metadata: {
    pageCount?: number;
    language?: string;
    detectedEntities?: string[];
    pdfMetadata?: any;
    processingDate?: string;
    aiModel?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface DocumentsResponse {
  documents: Document[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/**
 * Fetch all documents for the authenticated user
 */
export async function getDocuments(
  token: string,
  params?: {
    status?: string;
    limit?: number;
    page?: number;
  }
): Promise<ApiResponse<DocumentsResponse>> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append('status', params.status);
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.page) queryParams.append('page', params.page.toString());

  const url = `${API_URL}/api/documents${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Fetch a specific document by ID
 */
export async function getDocument(
  token: string,
  documentId: string
): Promise<ApiResponse<Document>> {
  const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Delete a document
 */
export async function deleteDocument(
  token: string,
  documentId: string
): Promise<ApiResponse<void>> {
  const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

export interface AgentChatResponse {
  summary: string;
  surgeProbabilityInsight?: string;
  staffingPlan?: string;
  supplyPlan?: string;
  suggestedActions?: string[];
  suggestedMedicines?: string[];
  suggestedDiseases?: string[];
  weatherImpact?: string;
  aqiImpact?: string;
  confidence?: string;
  modelVersion?: string;
  generatedAt?: string;
}

export interface Prediction {
  _id: string;
  region: string;
  date: string;
  surgeProbability: number;
  estimatedPatientCount?: number;
  modelVersion: string;
  staffAdvice: {
    doctors: number;
    nurses: number;
    supportStaff: number;
    notes: string;
  };
  supplyAdvice: {
    oxygen: number;
    medicines: string[];
    ppe: number;
    notes: string;
  };
  topFactors: Array<{ feature: string; impact: number }>;
  suggestedMedicines: string[];
  suggestedDiseases: string[];
  activePandemics?: Array<{
    diseaseName: string;
    activeCases: number;
    newCases: number;
    severity: string;
    transmissionRate: number;
  }>;
  weatherImpact: string;
  aqiImpact: string;
}

export interface AqiReading {
  _id: string;
  location: string;
  timestamp: string;
  aqi: number;
  pm25: number;
  pm10: number;
}

export interface WeatherReading {
  _id: string;
  location: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
}

export async function runAgentChat(
  token: string,
  payload: {
    message: string;
    context?: Record<string, unknown>;
  }
): Promise<ApiResponse<AgentChatResponse>> {
  const response = await fetch(`${API_URL}/api/agent/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

/**
 * Get latest prediction with real-time data
 */
export async function getLatestPrediction(
  token: string,
  city: string
): Promise<ApiResponse<{ prediction: Prediction; aqi: AqiReading; weather: WeatherReading }>> {
  if (!city) {
    throw new Error('City name is required');
  }
  const response = await fetch(`${API_URL}/api/predictions/latest?city=${encodeURIComponent(city)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Generate a new prediction
 */
export async function generatePrediction(
  token: string,
  city: string,
  date?: string
): Promise<ApiResponse<Prediction>> {
  if (!city) {
    throw new Error('City name is required');
  }
  const response = await fetch(`${API_URL}/api/predictions/predict`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ city, date }),
  });

  return response.json();
}

/**
 * Get prediction history
 */
export async function getPredictionHistory(
  token: string,
  city: string,
  days: number = 30
): Promise<ApiResponse<Prediction[]>> {
  if (!city) {
    throw new Error('City name is required');
  }
  const response = await fetch(`${API_URL}/api/predictions/history?city=${encodeURIComponent(city)}&days=${days}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Download prediction data
 */
export async function downloadPredictions(
  token: string,
  city: string,
  days: number = 30
): Promise<Blob> {
  if (!city) {
    throw new Error('City name is required');
  }
  const response = await fetch(`${API_URL}/api/predictions/download?city=${encodeURIComponent(city)}&days=${days}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Download failed');
  }

  return response.blob();
}

/**
 * Chat about diseases and medicines
 */
export async function chatDiseaseMedicine(
  token: string,
  question: string,
  city?: string
): Promise<ApiResponse<{ question: string; answer: string; context: any }>> {
  const response = await fetch(`${API_URL}/api/disease-medicine/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, city }),
  });

  return response.json();
}

// Resource interfaces
export interface Resource {
  _id: string;
  userId: string;
  userEmail: string;
  fileName: string;
  fileSize: number;
  processingStatus: 'processing' | 'completed' | 'failed';
  resourceData: {
    doctors: Array<{
      name: string;
      available_days: string;
      time: string;
    }>;
    nurses: Array<{
      name: string;
      available_days: string;
      time: string;
    }>;
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
  };
  metadata: {
    pageCount?: number;
    processingDate?: string;
    aiModel?: string;
  };
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourcesResponse {
  resources: Resource[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/**
 * Upload a resource PDF file
 */
export async function uploadResourcePDF(
  token: string,
  file: File
): Promise<ApiResponse<{
  resourceId: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  resourceData: Resource['resourceData'];
  processingStatus: string;
}>> {
  const formData = new FormData();
  formData.append('pdf', file);

  const response = await fetch(`${API_URL}/api/resources/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return response.json();
}

/**
 * Get all resources for the authenticated user
 */
export async function getResources(
  token: string,
  params?: {
    limit?: number;
    page?: number;
  }
): Promise<ApiResponse<ResourcesResponse>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.page) queryParams.append('page', params.page.toString());

  const url = `${API_URL}/api/resources${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Get the latest resource
 */
export async function getLatestResource(
  token: string
): Promise<ApiResponse<Resource>> {
  const response = await fetch(`${API_URL}/api/resources/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Get a specific resource by ID
 */
export async function getResource(
  token: string,
  resourceId: string
): Promise<ApiResponse<Resource>> {
  const response = await fetch(`${API_URL}/api/resources/${resourceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Delete a resource
 */
export async function deleteResource(
  token: string,
  resourceId: string
): Promise<ApiResponse<void>> {
  const response = await fetch(`${API_URL}/api/resources/${resourceId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Get aggregated resources (all resources merged together)
 */
export async function getAggregatedResources(
  token: string
): Promise<ApiResponse<{
  hospitalName?: string | null;
  hospitalAddress?: string | null;
  city?: string | null;
  doctors: Array<{ name: string; available_days: string; time: string }>;
  nurses: Array<{ name: string; available_days: string; time: string }>;
  inventory: Resource['resourceData']['inventory'];
  resources: Array<{ _id: string; fileName: string; createdAt: string; updatedAt: string }>;
}>> {
  const response = await fetch(`${API_URL}/api/resources/aggregated`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

// ======================== ALLOCATION INTERFACES ========================

export interface PatientInfo {
  name?: string;
  age?: string;
  gender?: string;
  id?: string;
  contactNumber?: string;
  email?: string;
}

export interface PrescriptionDetails {
  doctorName?: string;
  medicines?: Array<{
    name?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
  }>;
  diagnosis?: string;
  visitDate?: string;
}

export interface AllocatedResources {
  beds?: {
    bedType: string; // 'general', 'icu', 'isolation'
    bedNumber?: string;
    quantity: number;
    allocatedDate?: Date;
  };
  oxygenCylinders?: {
    quantity: number;
    allocatedDate?: Date;
  };
  dialysis?: {
    sessions: number;
    frequency: string;
    allocatedDate?: Date;
  };
  otherServices?: Array<{
    serviceName: string;
    serviceType: string;
    quantity: number;
    allocatedDate?: Date;
  }>;
}

export interface Allocation {
  _id: string;
  userId: string;
  userEmail: string;
  documentId: string;
  patientInfo: PatientInfo;
  prescriptionDetails: PrescriptionDetails;
  allocatedResources: AllocatedResources;
  status: 'pending' | 'allocated' | 'deallocated' | 'completed';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ======================== ALLOCATION API FUNCTIONS ========================

/**
 * Create a new allocation with resources
 */
export async function createAllocation(
  token: string,
  payload: {
    documentId: string;
    patientInfo: PatientInfo;
    prescriptionDetails: PrescriptionDetails;
    allocatedResources: AllocatedResources;
    notes?: string;
  }
): Promise<ApiResponse<{ allocationId: string; allocation: Allocation; lowStockAlerts: any[] }>> {
  const response = await fetch(`${API_URL}/api/allocations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

/**
 * Get all allocations for the user
 */
export async function getAllocations(
  token: string,
  params?: {
    limit?: number;
    page?: number;
    status?: string;
  }
): Promise<ApiResponse<{ allocations: Allocation[]; pagination: { total: number; page: number; limit: number; pages: number } }>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.status) queryParams.append('status', params.status);

  const url = `${API_URL}/api/allocations${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Get a specific allocation
 */
export async function getAllocation(
  token: string,
  allocationId: string
): Promise<ApiResponse<Allocation>> {
  const response = await fetch(`${API_URL}/api/allocations/${allocationId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Update an allocation status
 */
export async function updateAllocation(
  token: string,
  allocationId: string,
  payload: { status?: string; notes?: string }
): Promise<ApiResponse<Allocation>> {
  const response = await fetch(`${API_URL}/api/allocations/${allocationId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

/**
 * Deallocate/delete resources
 */
export async function deallocateResources(
  token: string,
  allocationId: string
): Promise<ApiResponse<Allocation>> {
  const response = await fetch(`${API_URL}/api/allocations/${allocationId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

/**
 * Check stock levels
 */
export async function checkStockLevels(
  token: string
): Promise<ApiResponse<{ lowStockItems: any[]; inventory: any; hasLowStock: boolean }>> {
  const response = await fetch(`${API_URL}/api/allocations/check-stock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.json();
}

