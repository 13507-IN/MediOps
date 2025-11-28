import { GoogleGenerativeAI } from '@google/generative-ai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';
import { withRetry } from '../utils/geminiRetry.js';
import { GEMINI_MODEL } from '../utils/geminiConfig.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Extract text from PDF using pdfjs-dist
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Object>} - Extracted text and metadata
 */
export async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = new Uint8Array(dataBuffer);
    
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    
    const numPages = pdfDocument.numPages;
    let fullText = '';
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    const metadata = await pdfDocument.getMetadata();

    return {
      text: fullText.trim(),
      pages: numPages,
      info: metadata.info,
      metadata: metadata.metadata,
    };
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Analyze PDF content using Gemini 2.5 Flash
 * @param {string} text - Extracted text from PDF
 * @returns {Promise<Object>} - Analysis results from Gemini
 */
export async function analyzePDFWithGemini(text) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Use Gemini model (defaults to gemini-1.5-flash for higher quotas)
    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are a medical document analysis assistant. Analyze the following medical document text and extract structured information.

Please provide:
1. Document Type (e.g., Lab Report, Prescription, Medical Record, Insurance Document, etc.)
2. Key Medical Information:
   - Patient details (if available)
   - Medical conditions or diagnoses
   - Medications mentioned
   - Test results and values
   - Dates and appointments
3. Important Medical Terms and their context
4. Summary of the document
5. Any critical findings or alerts

Document Text:
${text}

Please provide the response in a structured JSON format with the following keys:
- documentType
- patientInfo (object with name, age, gender, id if available)
- medicalConditions (array)
- medications (array with name, dosage, frequency if available)
- testResults (array with test name, value, unit, reference range if available)
- dates (array of important dates with context)
- medicalTerms (array of important medical terms with brief explanation)
- summary (brief summary of the document)
- criticalFindings (array of any urgent or critical information)
- confidence (your confidence level in the analysis: high/medium/low)
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    const analysisText = response.text();

    // Try to parse JSON from the response
    let analysis;
    try {
      // Remove markdown code blocks if present
      const jsonText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      // If JSON parsing fails, return the raw text
      console.warn('Could not parse Gemini response as JSON, returning raw text');
      analysis = {
        rawAnalysis: analysisText,
        documentType: 'Unknown',
        summary: analysisText.substring(0, 500),
        confidence: 'low',
      };
    }

    return analysis;
  } catch (error) {
    console.error('Error analyzing PDF with Gemini:', error);
    throw new Error(`Gemini analysis failed: ${error.message}`);
  }
}

/**
 * Process PDF file: Extract text and analyze with Gemini
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Object>} - Complete processing results
 */
export async function processPDFWithGemini(filePath) {
  try {
    console.log('📄 Extracting text from PDF...');
    const pdfData = await extractTextFromPDF(filePath);

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error('No text could be extracted from the PDF');
    }

    console.log('🤖 Analyzing content with Gemini AI...');
    const analysis = await analyzePDFWithGemini(pdfData.text);

    return {
      extractedText: pdfData.text,
      pageCount: pdfData.pages,
      pdfMetadata: pdfData.info,
      geminiAnalysis: analysis,
      processingDate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error processing PDF with Gemini:', error);
    throw error;
  }
}

/**
 * Ask a question about the PDF content using Gemini
 * @param {string} text - Extracted text from PDF
 * @param {string} question - User's question
 * @returns {Promise<string>} - Answer from Gemini
 */
export async function askQuestionAboutPDF(text, question) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are a medical document assistant. Based on the following medical document, please answer the user's question accurately and concisely.

Document Text:
${text}

User Question: ${question}

Please provide a clear, accurate answer based only on the information in the document. If the information is not available in the document, please state that clearly.
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error asking question with Gemini:', error);
    throw new Error(`Failed to get answer: ${error.message}`);
  }
}

/**
 * Run the MediOps AI operations agent
 * @param {string} message - User prompt/question
 * @param {Object} context - Optional structured context (region, timeframe, metrics, etc.)
 * @returns {Promise<Object>} Structured AI response
 */
export async function runOperationsAgent(message, context = {}) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const contextBlock = typeof context === 'string'
      ? context
      : JSON.stringify(context || {}, null, 2);

    const prompt = `
You are MediOps AI, an operations-focused healthcare copilot. Provide concise, actionable insights for hospital admins.

Output MUST be valid JSON with keys:
{
  "summary": string,
  "surgeProbabilityInsight": string,
  "staffingPlan": string,
  "supplyPlan": string,
  "suggestedActions": string[],
  "suggestedMedicines": string[],
  "suggestedDiseases": string[],
  "weatherImpact": string,
  "aqiImpact": string,
  "confidence": "high" | "medium" | "low"
}

Based on the context data (AQI, weather, surge probability), suggest:
- Medicines that may be needed (e.g., for respiratory issues if AQI ≥ 100, ORS for heat ONLY if temperature ≥ 35°C, antibiotics for cold weather ONLY if temperature ≤ 10°C)
- Diseases that may spike (e.g., respiratory infections for AQI ≥ 100, heat stroke ONLY if temperature ≥ 35°C, flu for cold weather ONLY if temperature ≤ 10°C)

IMPORTANT: Be realistic with suggestions:
- Heat-related conditions ONLY for temperatures ≥ 35°C
- Cold-related conditions ONLY for temperatures ≤ 10°C
- Respiratory conditions from AQI ONLY for AQI ≥ 100
- Do NOT suggest heat stroke for temperatures below 30°C
- Do NOT suggest hypothermia for temperatures above 10°C

Context (may be empty):
${contextBlock}

User Message:
${message}
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    const rawText = response.text().trim();

    let parsed;
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.warn('AI agent returned non-JSON payload, falling back to plain text.');
      parsed = {
        summary: rawText,
        surgeProbabilityInsight: 'Not provided',
        staffingPlan: 'Not provided',
        supplyPlan: 'Not provided',
        suggestedActions: [],
        confidence: 'low',
      };
    }

    return {
      ...parsed,
      modelVersion: modelName,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('runOperationsAgent error:', error);
    throw new Error(`AI agent failed: ${error.message}`);
  }
}

/**
 * Analyze resource PDF content using Gemini AI
 * Extracts structured hospital resource data (doctors, nurses, inventory, equipment)
 * @param {string} text - Extracted text from PDF via OCR
 * @returns {Promise<Object>} Structured resource data
 */
export async function analyzeResourcePDF(text) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are an advanced medical-document analysis assistant. 

Your task is to read the extracted text from a hospital inventory or daily resource report and return a clean, structured JSON summary.

From the text, extract and identify the following:

1. Hospital Information:
   - Hospital name (if mentioned)
   - Hospital address (full address if available)
   - City name (extract from address or location mentioned)

2. Doctor Information:
   - Doctor names
   - Their weekly availability (days + timings if mentioned)

3. Nurse Information:
   - Nurse names
   - Weekly availability (days + timings if available)

4. Inventory Count:
   - Medicines (list each medicine and count)
   - Saline (count)
   - Injections (count)
   - Antibodies (count)
   - OT Rooms (count)
   - General Beds (count)
   - ICU Beds (count if mentioned)
   - Isolation Beds (count if mentioned)
   - Oxygen Cylinders (count)
   - Dialysis Machines (count)
   - Available Nurses (count if provided)
   - Medical Instruments (list + count)
   - ECG Machines (count)
   - CT Scan Machines (count)
   - Endoscopy Machines (count)
   - Blood Pressure Management Machines (count)
   - Ultrasonography Machines (count)
   - X-Ray Machines (count)
   - Any additional medical equipment mentioned (list + count)

4. Other Resources:
   - Any additional hospital facility or resource mentioned.

Return all results strictly in the following JSON structure:

{
  "hospitalName": "",
  "hospitalAddress": "",
  "city": "",
  "doctors": [
    { "name": "", "available_days": "", "time": "" }
  ],
  "nurses": [
    { "name": "", "available_days": "", "time": "" }
  ],
  "inventory": {
    "medicines": [{ "name": "", "count": 0 }],
    "saline": 0,
    "injections": 0,
    "antibodies": 0,
    "ot_rooms": 0,
    "general_beds": 0,
    "icu_beds": 0,
    "isolation_beds": 0,
    "oxygen_cylinders": 0,
    "dialysis_machines": 0,
    "available_nurses_count": 0,
    "instruments": [{ "name": "", "count": 0 }],
    "ecg_machines": 0,
    "ct_scan": 0,
    "endoscopy": 0,
    "bp_machines": 0,
    "ultrasonography": 0,
    "xray_machines": 0,
    "other_equipment": [{ "name": "", "count": 0 }]
  }
}

If any field is missing from the document, set its value to null or 0.

Do NOT infer or guess anything. Only use information present in the text.

Extracted Text:
${text}
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    const rawText = response.text().trim();

    // Try to parse JSON from the response
    let resourceData;
    try {
      // Remove markdown code blocks if present
      const jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      resourceData = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('Could not parse Gemini resource analysis as JSON, attempting to fix...');
      // Try to extract JSON from the response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          resourceData = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('Failed to parse resource data:', e);
          throw new Error('Failed to parse resource data from AI response');
        }
      } else {
        throw new Error('No valid JSON found in AI response');
      }
    }

    // Validate and normalize the structure
    const normalizedData = {
      hospitalName: resourceData.hospitalName || null,
      hospitalAddress: resourceData.hospitalAddress || null,
      city: resourceData.city || null,
      doctors: Array.isArray(resourceData.doctors) ? resourceData.doctors : [],
      nurses: Array.isArray(resourceData.nurses) ? resourceData.nurses : [],
      inventory: {
        medicines: Array.isArray(resourceData.inventory?.medicines) ? resourceData.inventory.medicines : [],
        saline: resourceData.inventory?.saline ?? 0,
        injections: resourceData.inventory?.injections ?? 0,
        antibodies: resourceData.inventory?.antibodies ?? 0,
        ot_rooms: resourceData.inventory?.ot_rooms ?? 0,
        general_beds: resourceData.inventory?.general_beds ?? 0,
        icu_beds: resourceData.inventory?.icu_beds ?? 0,
        isolation_beds: resourceData.inventory?.isolation_beds ?? 0,
        available_nurses_count: resourceData.inventory?.available_nurses_count ?? 0,
        instruments: Array.isArray(resourceData.inventory?.instruments) ? resourceData.inventory.instruments : [],
        ecg_machines: resourceData.inventory?.ecg_machines ?? 0,
        ct_scan: resourceData.inventory?.ct_scan ?? 0,
        endoscopy: resourceData.inventory?.endoscopy ?? 0,
        bp_machines: resourceData.inventory?.bp_machines ?? 0,
        ultrasonography: resourceData.inventory?.ultrasonography ?? 0,
        xray_machines: resourceData.inventory?.xray_machines ?? 0,
        oxygen_cylinders: resourceData.inventory?.oxygen_cylinders ?? 0,
        dialysis_machines: resourceData.inventory?.dialysis_machines ?? 0,
        other_equipment: Array.isArray(resourceData.inventory?.other_equipment) ? resourceData.inventory.other_equipment : [],
      },
    };

    return normalizedData;
  } catch (error) {
    console.error('Error analyzing resource PDF with Gemini:', error);
    throw new Error(`Resource analysis failed: ${error.message}`);
  }
}
