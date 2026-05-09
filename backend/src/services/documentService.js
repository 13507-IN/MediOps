import fs from 'fs/promises';
import { extractTextFromPDF as extractTextWithVision, extractEntities } from './ocrService.js';
import { processPDFWithGemini, extractTextFromPDF as extractTextWithPdfjs } from './geminiService.js';
import { GEMINI_MODEL } from '../utils/geminiConfig.js';

export async function analyzeDocument(filePath, options = {}) {
  const {
    useOCR = true,
    useGemini = true,
    fallbackToGemini = true,
  } = options;

  let ocrText = null;
  let ocrConfidence = null;
  let pageCount = 0;
  let extractedData = null;
  let processingMethod = 'none';

  if (useOCR) {
    try {
      console.log('🔄 Attempting OCR with Google Vision...');
      const visionResult = await extractTextWithVision(filePath);
      ocrText = visionResult.text;
      ocrConfidence = visionResult.confidence;
      pageCount = visionResult.pages;
      processingMethod = 'ocr';

      if (ocrText && ocrText.trim().length > 0) {
        extractedData = extractEntities(ocrText);
        console.log(`✅ OCR successful: ${ocrText.length} characters extracted`);
      }
    } catch (ocrError) {
      console.warn('⚠️ OCR failed:', ocrError.message);
      if (!fallbackToGemini) {
        throw new Error(`OCR processing failed: ${ocrError.message}`);
      }
    }
  }

  if (useGemini) {
    try {
      console.log('🔄 Running Gemini AI analysis...');
      const geminiResult = await processPDFWithGemini(filePath);

      if (!ocrText) {
        ocrText = geminiResult.extractedText;
        pageCount = geminiResult.pageCount;
        processingMethod = 'gemini';
      }

      extractedData = geminiResult.geminiAnalysis || extractedData;

      console.log('✅ Gemini analysis completed');
    } catch (geminiError) {
      console.warn('⚠️ Gemini analysis failed:', geminiError.message);
      if (!ocrText) {
        throw new Error(`All processing methods failed. Gemini: ${geminiError.message}`);
      }
    }
  }

  if (!ocrText) {
    throw new Error('No text could be extracted from the document');
  }

  return {
    extractedText: ocrText,
    ocrConfidence,
    pageCount,
    extractedData,
    processingMethod,
    aiModel: GEMINI_MODEL,
    processingDate: new Date().toISOString(),
  };
}

export async function extractDocumentText(filePath) {
  try {
    const visionResult = await extractTextWithVision(filePath);
    return visionResult;
  } catch {
    const pdfjsResult = await extractTextWithPdfjs(filePath);
    return {
      text: pdfjsResult.extractedText,
      confidence: null,
      pages: pdfjsResult.pageCount,
      language: 'en',
    };
  }
}
