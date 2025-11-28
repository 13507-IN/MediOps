import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from '../utils/geminiRetry.js';
import { GEMINI_MODEL } from '../utils/geminiConfig.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Get real disease names based on weather and AQI conditions
 */
export async function getDiseasesForConditions(weather, aqi, surgeProbability) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return getDefaultDiseases(weather, aqi);
    }

    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const temp = weather?.temperature || 0;
    const aqiValue = aqi?.aqi || 0;
    
    const prompt = `
You are a medical expert. Based on the following environmental conditions, provide a list of REAL medical disease names (use proper medical terminology) that are likely to increase.

IMPORTANT THRESHOLDS - Only suggest diseases that are ACTUALLY relevant:
- Heat-related diseases (Heat Stroke, Heat Exhaustion) ONLY if temperature is ≥ 35°C
- Cold-related diseases (Hypothermia, Frostbite) ONLY if temperature is ≤ 5°C
- Respiratory diseases from AQI ONLY if AQI ≥ 100
- Do NOT suggest heat stroke if temperature is below 30°C
- Do NOT suggest hypothermia if temperature is above 10°C

Weather Conditions:
- Temperature: ${temp}°C ${temp >= 35 ? '(HOT - heat-related illnesses possible)' : temp <= 5 ? '(COLD - cold-related illnesses possible)' : '(NORMAL)'}
- Humidity: ${weather?.humidity || 'N/A'}%
- Wind Speed: ${weather?.windSpeed || 'N/A'} km/h
- Precipitation: ${weather?.precipitation || 'N/A'} mm

Air Quality:
- AQI: ${aqiValue} ${aqiValue >= 150 ? '(UNHEALTHY - respiratory issues likely)' : aqiValue >= 100 ? '(UNHEALTHY FOR SENSITIVE - respiratory issues possible)' : '(NORMAL)'}
- PM2.5: ${aqi?.pm25 || 'N/A'}
- PM10: ${aqi?.pm10 || 'N/A'}

Surge Probability: ${surgeProbability}%

Provide a JSON array of disease names (use proper medical names like "Acute Respiratory Distress Syndrome" not "breathing problems"):
{
  "diseases": ["Disease Name 1", "Disease Name 2", ...],
  "explanations": {
    "Disease Name 1": "Brief explanation why this disease is likely",
    ...
  }
}

Return ONLY valid JSON, no markdown formatting. Be realistic - only suggest diseases that actually match the conditions.
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    const text = response.text().trim();

    // Parse JSON response
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return parsed.diseases || [];
    } catch (parseError) {
      console.warn('Failed to parse disease response, using defaults');
      return getDefaultDiseases(weather, aqi);
    }
  } catch (error) {
    console.error('Error fetching diseases:', error);
    return getDefaultDiseases(weather, aqi);
  }
}

/**
 * Get real medicine names based on diseases and conditions
 */
export async function getMedicinesForDiseases(diseases, weather, aqi) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return getDefaultMedicines(weather, aqi);
    }

    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are a medical expert. Based on the following diseases and conditions, provide a list of REAL medicine names (use proper pharmaceutical names):

Diseases to treat:
${diseases.map(d => `- ${d}`).join('\n')}

Weather Conditions:
- Temperature: ${weather?.temperature || 'N/A'}°C
- Humidity: ${weather?.humidity || 'N/A'}%

Air Quality:
- AQI: ${aqi?.aqi || 'N/A'}
- PM2.5: ${aqi?.pm25 || 'N/A'}

Provide a JSON array of medicine names (use proper pharmaceutical names like "Albuterol Sulfate" not "inhaler"):
{
  "medicines": ["Medicine Name 1", "Medicine Name 2", ...],
  "explanations": {
    "Medicine Name 1": "Brief explanation of use",
    ...
  }
}

Return ONLY valid JSON, no markdown formatting.
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    const text = response.text().trim();

    // Parse JSON response
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return parsed.medicines || [];
    } catch (parseError) {
      console.warn('Failed to parse medicine response, using defaults');
      return getDefaultMedicines(weather, aqi);
    }
  } catch (error) {
    console.error('Error fetching medicines:', error);
    return getDefaultMedicines(weather, aqi);
  }
}

/**
 * Default diseases based on conditions (fallback)
 * Uses strict temperature thresholds to prevent absurd suggestions
 */
function getDefaultDiseases(weather, aqi) {
  const diseases = [];
  const temp = weather?.temperature || 0;
  const aqiValue = aqi?.aqi || 0;

  // AQI-related diseases (only for unhealthy air quality)
  if (aqiValue >= 150) {
    diseases.push('Asthma Exacerbation', 'Chronic Obstructive Pulmonary Disease (COPD)', 'Acute Bronchitis', 'Respiratory Distress');
  } else if (aqiValue >= 100) {
    diseases.push('Asthma Exacerbation', 'Acute Bronchitis');
  }

  // Heat-related diseases (ONLY for high temperatures ≥ 35°C)
  if (temp >= 40) {
    diseases.push('Heat Stroke', 'Heat Exhaustion', 'Severe Dehydration', 'Heat Cramps');
  } else if (temp >= 35) {
    diseases.push('Heat Exhaustion', 'Dehydration', 'Heat Cramps');
  }
  // DO NOT suggest heat-related diseases below 35°C

  // Cold-related diseases (ONLY for low temperatures ≤ 10°C)
  if (temp <= 5) {
    diseases.push('Hypothermia', 'Frostbite', 'Common Cold', 'Influenza', 'Pneumonia');
  } else if (temp <= 10) {
    diseases.push('Common Cold', 'Influenza', 'Pneumonia');
  }
  // DO NOT suggest cold-related diseases above 10°C

  // Humidity-related diseases
  if (weather?.humidity >= 85) {
    diseases.push('Fungal Skin Infections', 'Dermatophytosis');
  }

  // Precipitation-related diseases
  if (weather?.precipitation >= 20) {
    diseases.push('Waterborne Diseases', 'Vector-borne Diseases');
  } else if (weather?.precipitation >= 5) {
    diseases.push('Vector-borne Diseases');
  }

  // Default if no specific conditions match
  return diseases.length > 0 ? diseases : ['Upper Respiratory Tract Infection'];
}

/**
 * Default medicines based on conditions (fallback)
 */
function getDefaultMedicines(weather, aqi) {
  const medicines = [];

  if (aqi?.aqi > 100) {
    medicines.push('Albuterol Sulfate', 'Budesonide', 'Montelukast Sodium');
  }

  if (weather?.temperature > 35) {
    medicines.push('Oral Rehydration Solution (ORS)', 'Paracetamol', 'IV Fluids');
  } else if (weather?.temperature < 15) {
    medicines.push('Amoxicillin', 'Azithromycin', 'Dextromethorphan');
  }

  if (weather?.humidity > 80) {
    medicines.push('Clotrimazole', 'Miconazole Nitrate');
  }

  return medicines.length > 0 ? medicines : ['Paracetamol', 'Ibuprofen'];
}

/**
 * Chat with AI about diseases and medicines
 */
export async function chatAboutDiseaseMedicine(question, context = {}) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const contextInfo = context.weather || context.aqi 
      ? `\n\nCurrent Conditions:\n${JSON.stringify(context, null, 2)}`
      : '';

    const prompt = `
You are a medical information assistant. Answer questions about diseases and medicines accurately and helpfully.

${contextInfo}

User Question: ${question}

Provide a clear, accurate answer. If asking about a specific disease or medicine, use proper medical terminology.
If you don't know something, say so clearly. Always prioritize accuracy and safety.
`;

    const result = await withRetry(
      async () => await model.generateContent(prompt),
      { maxRetries: 3, initialDelay: 2000, maxDelay: 60000 }
    );
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error in disease/medicine chat:', error);
    throw new Error(`Failed to get answer: ${error.message}`);
  }
}






