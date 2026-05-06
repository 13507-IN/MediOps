import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middleware/auth.js';
import Resource from '../models/Resource.js';
import { extractTextFromPDF, processPDFWithGemini, analyzeResourcePDF } from '../services/geminiService.js';
import { GEMINI_MODEL } from '../utils/geminiConfig.js';
import { extractCityName, autoCorrectCityName } from '../utils/locationUtils.js';
import { emitToUser } from '../utils/sseManager.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = './uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'resource-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

/**
 * POST /api/resources/upload
 * Upload a resource PDF, extract text via OCR, and analyze with Gemini
 */
router.post('/upload', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    console.log(`📤 Processing Resource PDF: ${req.file.originalname}`);

    emitToUser(req.user.id, 'resource:uploading', {
      fileName: req.file.originalname,
      message: 'Resource PDF uploaded, starting analysis',
    });

    // Create resource record in database
    const resource = new Resource({
      userId: req.user.id,
      userEmail: req.user.email,
      hospitalId: req.user.hospitalId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      filePath: req.file.path,
      processingStatus: 'processing',
    });

    await resource.save();

    // Process PDF: Extract text and analyze with Gemini
    try {
      // Step 1: Extract text from PDF using pdfjs-dist
      const pdfResult = await processPDFWithGemini(req.file.path);
      const extractedText = pdfResult.extractedText;

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text could be extracted from the PDF');
      }

      // Step 2: Analyze extracted text with Gemini for resource data
      const resourceData = await analyzeResourcePDF(extractedText);

      // Update resource with results
      await Resource.findByIdAndUpdate(resource._id, {
        extractedText: extractedText,
        processingStatus: 'completed',
        resourceData: resourceData,
        metadata: {
          pageCount: pdfResult.pageCount,
          processingDate: new Date().toISOString(),
          aiModel: GEMINI_MODEL,
        },
      });

      // Fetch updated resource
      const updatedResource = await Resource.findById(resource._id).select('-filePath -extractedText');

      emitToUser(req.user.id, 'resource:completed', {
        resourceId: updatedResource._id,
        resource: updatedResource,
        message: 'Resource PDF analyzed successfully',
      });

      res.status(200).json({
        success: true,
        message: 'Resource PDF analyzed successfully',
        data: {
          resourceId: updatedResource._id,
          fileName: updatedResource.fileName,
          fileSize: updatedResource.fileSize,
          pageCount: updatedResource.metadata.pageCount,
          resourceData: updatedResource.resourceData,
          processingStatus: updatedResource.processingStatus,
        },
      });
    } catch (processingError) {
      // Update resource with error status
      await Resource.findByIdAndUpdate(resource._id, {
        processingStatus: 'failed',
        errorMessage: processingError.message,
      });

      emitToUser(req.user.id, 'resource:failed', {
        resourceId: resource._id,
        error: processingError.message,
        message: 'Resource analysis failed',
      });

      throw processingError;
    }
  } catch (error) {
    console.error('Resource PDF analysis error:', error);
    
    // Clean up uploaded file if exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error analyzing resource PDF',
    });
  }
});

/**
 * GET /api/resources
 * Get all resources for the authenticated user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;

    const resources = await Resource.find({ 
      userId: req.user.id,
      hospitalId: req.user.hospitalId 
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-filePath -extractedText'); // Don't expose file path and full text

    const total = await Resource.countDocuments({ 
      userId: req.user.id,
      hospitalId: req.user.hospitalId 
    });

    res.json({
      success: true,
      data: {
        resources,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resources',
    });
  }
});

/**
 * GET /api/resources/latest
 * Get the latest resource for the authenticated user
 */
router.get('/latest', requireAuth, async (req, res) => {
  try {
    const resource = await Resource.findOne({ 
      userId: req.user.id,
      hospitalId: req.user.hospitalId 
    })
      .sort({ createdAt: -1 })
      .select('-filePath -extractedText');

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'No resources found',
      });
    }

    res.json({
      success: true,
      data: resource,
    });
  } catch (error) {
    console.error('Get latest resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching latest resource',
    });
  }
});

/**
 * GET /api/resources/aggregated
 * Get all resources aggregated together (merged data)
 */
router.get('/aggregated', requireAuth, async (req, res) => {
  try {
    const resources = await Resource.find({ 
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
      processingStatus: 'completed'
    })
      .sort({ createdAt: -1 })
      .select('-filePath -extractedText');

    if (resources.length === 0) {
      return res.json({
        success: true,
        data: {
          doctors: [],
          nurses: [],
          inventory: {
            medicines: [],
            saline: 0,
            injections: 0,
            antibodies: 0,
            ot_rooms: 0,
            general_beds: 0,
            icu_beds: 0,
            isolation_beds: 0,
            oxygen_cylinders: 0,
            dialysis_machines: 0,
            available_nurses_count: 0,
            instruments: [],
            ecg_machines: 0,
            ct_scan: 0,
            endoscopy: 0,
            bp_machines: 0,
            ultrasonography: 0,
            xray_machines: 0,
            other_equipment: [],
          },
          resources: [],
        },
      });
    }

    // Get hospital info from the latest resource
    const latestResource = resources[0];
    const hospitalInfo = latestResource.resourceData || {};
    
    // Extract city from address if city is not directly provided
    let city = hospitalInfo.city;
    if (!city && hospitalInfo.hospitalAddress) {
      // Use locationUtils to extract city from address
      city = extractCityName(hospitalInfo.hospitalAddress);
      if (city) {
        city = autoCorrectCityName(city);
      }
    } else if (city) {
      // Auto-correct the city name if provided
      city = autoCorrectCityName(city);
    }
    
    // Aggregate all resource data
    const aggregated = {
      hospitalName: hospitalInfo.hospitalName || null,
      hospitalAddress: hospitalInfo.hospitalAddress || null,
      city: city || null,
      doctors: [],
      nurses: [],
      inventory: {
        medicines: [],
        saline: 0,
        injections: 0,
        antibodies: 0,
        ot_rooms: 0,
        general_beds: 0,
        icu_beds: 0,
        isolation_beds: 0,
        oxygen_cylinders: 0,
        dialysis_machines: 0,
        available_nurses_count: 0,
        instruments: [],
        ecg_machines: 0,
        ct_scan: 0,
        endoscopy: 0,
        bp_machines: 0,
        ultrasonography: 0,
        xray_machines: 0,
        other_equipment: [],
      },
    };

    const doctorMap = new Map();
    const nurseMap = new Map();
    const medicineMap = new Map();
    const instrumentMap = new Map();
    const equipmentMap = new Map();

    // Merge all resources
    resources.forEach((resource) => {
      const data = resource.resourceData || {};

      // Merge doctors (avoid duplicates by name)
      if (data.doctors && Array.isArray(data.doctors)) {
        data.doctors.forEach((doctor) => {
          if (doctor.name && !doctorMap.has(doctor.name)) {
            doctorMap.set(doctor.name, doctor);
            aggregated.doctors.push(doctor);
          }
        });
      }

      // Merge nurses (avoid duplicates by name)
      if (data.nurses && Array.isArray(data.nurses)) {
        data.nurses.forEach((nurse) => {
          if (nurse.name && !nurseMap.has(nurse.name)) {
            nurseMap.set(nurse.name, nurse);
            aggregated.nurses.push(nurse);
          }
        });
      }

      // Merge inventory
      if (data.inventory) {
        const inv = data.inventory;

        // Sum numeric values
        aggregated.inventory.saline += inv.saline || 0;
        aggregated.inventory.injections += inv.injections || 0;
        aggregated.inventory.antibodies += inv.antibodies || 0;
        aggregated.inventory.ot_rooms += inv.ot_rooms || 0;
        aggregated.inventory.general_beds += inv.general_beds || 0;
        aggregated.inventory.icu_beds += inv.icu_beds || 0;
        aggregated.inventory.isolation_beds += inv.isolation_beds || 0;
        aggregated.inventory.oxygen_cylinders += inv.oxygen_cylinders || 0;
        aggregated.inventory.dialysis_machines += inv.dialysis_machines || 0;
        aggregated.inventory.available_nurses_count += inv.available_nurses_count || 0;
        aggregated.inventory.ecg_machines += inv.ecg_machines || 0;
        aggregated.inventory.ct_scan += inv.ct_scan || 0;
        aggregated.inventory.endoscopy += inv.endoscopy || 0;
        aggregated.inventory.bp_machines += inv.bp_machines || 0;
        aggregated.inventory.ultrasonography += inv.ultrasonography || 0;
        aggregated.inventory.xray_machines += inv.xray_machines || 0;

        // Merge medicines (sum counts for same medicine)
        if (inv.medicines && Array.isArray(inv.medicines)) {
          inv.medicines.forEach((med) => {
            if (med.name) {
              const key = med.name.toLowerCase().trim();
              if (medicineMap.has(key)) {
                medicineMap.get(key).count += med.count || 0;
              } else {
                const newMed = { name: med.name, count: med.count || 0 };
                medicineMap.set(key, newMed);
                aggregated.inventory.medicines.push(newMed);
              }
            }
          });
        }

        // Merge instruments (sum counts for same instrument)
        if (inv.instruments && Array.isArray(inv.instruments)) {
          inv.instruments.forEach((inst) => {
            if (inst.name) {
              const key = inst.name.toLowerCase().trim();
              if (instrumentMap.has(key)) {
                instrumentMap.get(key).count += inst.count || 0;
              } else {
                const newInst = { name: inst.name, count: inst.count || 0 };
                instrumentMap.set(key, newInst);
                aggregated.inventory.instruments.push(newInst);
              }
            }
          });
        }

        // Merge other equipment (sum counts for same equipment)
        if (inv.other_equipment && Array.isArray(inv.other_equipment)) {
          inv.other_equipment.forEach((eq) => {
            if (eq.name) {
              const key = eq.name.toLowerCase().trim();
              if (equipmentMap.has(key)) {
                equipmentMap.get(key).count += eq.count || 0;
              } else {
                const newEq = { name: eq.name, count: eq.count || 0 };
                equipmentMap.set(key, newEq);
                aggregated.inventory.other_equipment.push(newEq);
              }
            }
          });
        }
      }
    });

    res.json({
      success: true,
      data: {
        ...aggregated,
        resources: resources.map(r => ({
          _id: r._id,
          fileName: r.fileName,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get aggregated resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching aggregated resources',
    });
  }
});

/**
 * GET /api/resources/:id
 * Get a specific resource by ID
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const resource = await Resource.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).select('-filePath -extractedText');

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    }

    res.json({
      success: true,
      data: resource,
    });
  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resource',
    });
  }
});

/**
 * DELETE /api/resources/:id
 * Delete a resource
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const resource = await Resource.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    }

    // Delete the file from disk
    try {
      await fs.unlink(resource.filePath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Delete from database
    await resource.deleteOne();

    res.json({
      success: true,
      message: 'Resource deleted successfully',
    });
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting resource',
    });
  }
});

export default router;

