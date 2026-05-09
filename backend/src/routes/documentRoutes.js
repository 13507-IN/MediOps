import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middleware/auth.js';
import Document from '../models/Document.js';
import { analyzeDocument } from '../services/documentService.js';
import { emitToUser } from '../utils/sseManager.js';

const router = express.Router();

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
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

/**
 * POST /api/documents/upload
 * Unified upload: OCR (Google Vision) → Gemini AI analysis → Structured data
 * Falls back to Gemini if OCR fails
 */
router.post('/upload', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

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

    emitToUser(req.user.id, 'document:uploading', {
      documentId: document._id,
      fileName: req.file.originalname,
      message: 'File uploaded, starting unified analysis',
    });

    processDocument(document._id, req.file.path, req.user.id).catch(error => {
      console.error('Document processing error:', error);
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded. Unified OCR + AI analysis started.',
      data: {
        documentId: document._id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        status: document.processingStatus,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);

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

async function processDocument(documentId, filePath, userId) {
  try {
    emitToUser(userId, 'document:processing', {
      documentId,
      status: 'processing',
      message: 'Running OCR + AI analysis...',
    });

    const result = await analyzeDocument(filePath, {
      useOCR: true,
      useGemini: true,
      fallbackToGemini: true,
    });

    const updatedDoc = await Document.findByIdAndUpdate(documentId, {
      ocrText: result.extractedText,
      ocrConfidence: result.ocrConfidence,
      processingStatus: 'completed',
      extractedData: result.extractedData,
      metadata: {
        pageCount: result.pageCount,
        processingMethod: result.processingMethod,
        aiModel: result.aiModel,
        processingDate: result.processingDate,
        language: 'en',
      },
    }, { new: true }).select('-filePath');

    emitToUser(userId, 'document:completed', {
      documentId,
      document: updatedDoc,
      analysis: result.extractedData,
      pageCount: result.pageCount,
      processingMethod: result.processingMethod,
      status: 'completed',
      message: `Document analyzed via ${result.processingMethod}`,
    });
  } catch (error) {
    console.error(`Document processing failed for ${documentId}:`, error);

    await Document.findByIdAndUpdate(documentId, {
      processingStatus: 'failed',
      errorMessage: error.message,
    });

    emitToUser(userId, 'document:failed', {
      documentId,
      status: 'failed',
      error: error.message,
      message: 'Document processing failed',
    });
  }
}

/**
 * POST /api/documents/upload-async
 * Synchronous upload: waits for processing to complete before responding
 */
router.post('/upload-async', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

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

    const result = await analyzeDocument(req.file.path, {
      useOCR: true,
      useGemini: true,
      fallbackToGemini: true,
    });

    const updatedDoc = await Document.findByIdAndUpdate(document._id, {
      ocrText: result.extractedText,
      ocrConfidence: result.ocrConfidence,
      processingStatus: 'completed',
      extractedData: result.extractedData,
      metadata: {
        pageCount: result.pageCount,
        processingMethod: result.processingMethod,
        aiModel: result.aiModel,
        processingDate: result.processingDate,
      },
    }, { new: true }).select('-filePath');

    res.status(200).json({
      success: true,
      message: `Document analyzed via ${result.processingMethod}`,
      data: {
        documentId: updatedDoc._id,
        document: updatedDoc,
        analysis: result.extractedData,
        pageCount: result.pageCount,
        processingMethod: result.processingMethod,
      },
    });
  } catch (error) {
    console.error('Sync upload error:', error);

    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error processing document',
    });
  }
});

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
      .select('-filePath');

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

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
      ...(req.user.hospitalId && { hospitalId: req.user.hospitalId })
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

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
      ...(req.user.hospitalId && { hospitalId: req.user.hospitalId })
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    try {
      await fs.unlink(document.filePath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

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

export default router;
