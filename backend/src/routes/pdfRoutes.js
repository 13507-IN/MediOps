import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middleware/auth.js';
import Document from '../models/Document.js';
import { analyzeDocument } from '../services/documentService.js';
import { askQuestionAboutPDF } from '../services/geminiService.js';
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
 * POST /api/pdf/analyze
 * Alias for unified document upload (uses same pipeline as /api/documents/upload)
 */
router.post('/analyze', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    console.log(`📤 Processing PDF via unified pipeline: ${req.file.originalname}`);

    emitToUser(req.user.id, 'document:uploading', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      message: 'File uploaded, starting unified analysis',
    });

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

    try {
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

      emitToUser(req.user.id, 'document:completed', {
        documentId: document._id,
        document: updatedDoc,
        analysis: result.extractedData,
        pageCount: result.pageCount,
        processingMethod: result.processingMethod,
        status: 'completed',
        message: `PDF analyzed via ${result.processingMethod}`,
      });

      res.status(200).json({
        success: true,
        message: 'PDF analyzed successfully',
        data: {
          documentId: document._id,
          fileName: document.fileName,
          fileSize: document.fileSize,
          pageCount: result.pageCount,
          processingMethod: result.processingMethod,
          analysis: result.geminiAnalysis,
          extractedText: result.extractedText.substring(0, 1000) + '...',
        },
      });
    } catch (processingError) {
      await Document.findByIdAndUpdate(document._id, {
        processingStatus: 'failed',
        errorMessage: processingError.message,
      });

      emitToUser(req.user.id, 'document:failed', {
        documentId: document._id,
        status: 'failed',
        error: processingError.message,
        message: 'PDF analysis failed',
      });

      throw processingError;
    }
  } catch (error) {
    console.error('PDF analysis error:', error);

    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error analyzing PDF',
    });
  }
});

/**
 * POST /api/pdf/question/:id
 * Ask a question about a previously uploaded PDF
 */
router.post('/question/:id', requireAuth, async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required',
      });
    }

    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    if (document.processingStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Document is still being processed',
      });
    }

    if (!document.ocrText) {
      return res.status(400).json({
        success: false,
        message: 'No text available for this document',
      });
    }

    const answer = await askQuestionAboutPDF(document.ocrText, question);

    res.json({
      success: true,
      data: {
        question,
        answer,
        documentId: document._id,
        fileName: document.fileName,
      },
    });
  } catch (error) {
    console.error('Question answering error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing question',
    });
  }
});

router.get('/documents', requireAuth, async (req, res) => {
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
      .select('-filePath -ocrText');

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

router.get('/documents/:id', requireAuth, async (req, res) => {
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

router.delete('/documents/:id', requireAuth, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
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
