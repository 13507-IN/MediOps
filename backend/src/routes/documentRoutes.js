import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middleware/auth.js';
import Document from '../models/Document.js';
import { extractTextFromPDF, extractEntities } from '../services/ocrService.js';
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
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
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
 * POST /api/documents/upload
 * Upload a PDF file and process it with OCR
 */
router.post('/upload', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Check file size (minimum 5MB as per requirement)
    const minSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size < minSize) {
      // Delete the uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'File size must be at least 5MB',
      });
    }

    // Create document record in database
    const document = new Document({
      userId: req.user.id,
      userEmail: req.user.email,
      ...(req.user.hospitalId && { hospitalId: req.user.hospitalId }),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      filePath: req.file.path,
      processingStatus: 'processing',
    });

    await document.save();

    // Process OCR asynchronously
    processOCR(document._id, req.file.path, req.user.id).catch(error => {
      console.error('OCR processing error:', error);
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully. OCR processing started.',
      data: {
        documentId: document._id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        status: document.processingStatus,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    
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
      message: error.message || 'Error uploading file',
    });
  }
});

/**
 * GET /api/documents
 * Get all documents for the authenticated user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;

    const query = { 
      userId: req.user.id,
      ...(req.user.hospitalId && { hospitalId: req.user.hospitalId })
    };
    if (status) {
      query.processingStatus = status;
    }

    const documents = await Document.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-filePath'); // Don't expose file path

    const total = await Document.countDocuments(query);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
    });
  }
});

/**
 * GET /api/documents/:id
 * Get a specific document by ID
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    }).select('-filePath');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Delete the file from disk
    try {
      await fs.unlink(document.filePath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Delete from database
    await document.deleteOne();

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting document',
    });
  }
});

/**
 * Helper function to process OCR asynchronously
 */
async function processOCR(documentId, filePath, userId) {
  try {
    console.log(`🔄 Starting OCR processing for document ${documentId}`);

    emitToUser(userId, 'document:processing', {
      documentId,
      status: 'processing',
      message: 'OCR processing started',
    });

    // Extract text using Google Cloud Vision
    const ocrResult = await extractTextFromPDF(filePath);

    // Extract entities from the text
    const entities = extractEntities(ocrResult.text);

    // Update document with OCR results
    const updatedDoc = await Document.findByIdAndUpdate(documentId, {
      ocrText: ocrResult.text,
      ocrConfidence: ocrResult.confidence,
      processingStatus: 'completed',
      extractedData: entities,
      metadata: {
        pageCount: ocrResult.pages,
        language: ocrResult.language,
        detectedEntities: [
          ...entities.medicalTerms,
          ...entities.emails,
          ...entities.phones,
        ],
      },
    }, { new: true }).select('-filePath');

    console.log(`✅ OCR processing completed for document ${documentId}`);

    emitToUser(userId, 'document:completed', {
      documentId,
      document: updatedDoc,
      status: 'completed',
      confidence: ocrResult.confidence,
      pageCount: ocrResult.pages,
      message: 'OCR processing completed successfully',
    });
  } catch (error) {
    console.error(`❌ OCR processing failed for document ${documentId}:`, error);

    await Document.findByIdAndUpdate(documentId, {
      processingStatus: 'failed',
      errorMessage: error.message,
    });

    emitToUser(userId, 'document:failed', {
      documentId,
      status: 'failed',
      error: error.message,
      message: 'OCR processing failed',
    });
  }
}

export default router;
