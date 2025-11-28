import PandemicData from '../models/PandemicData.js';
import { getLatestAqi } from './dataService.js';
import { getDiseasesForConditions } from './diseaseMedicineService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from '../utils/geminiRetry.js';
import { GEMINI_MODEL } from '../utils/geminiConfig.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// === Configuration / thresholds ===
const CONFIG = {
  GEMINI_TIMEOUT_MS: 25_000,
  GEMINI_MAX_RETRIES: 3,
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MIN_ACTIVE_CASES_TO_PERSIST: 20,
  MIN_TRANSMISSION_RATE_TO_PERSIST: 1.0,
  SURGE_PROBABILITY_THRESHOLD: 40,
  MAX_PANDEMICS_RETURNED: 3,
  BASE_DECAY_FACTOR: 0.85, // daily multiplier when decaying old active cases
};

// Simple in-memory cache to avoid repeated expensive calls
const cache = new Map();

function setCache(key, value, ttl = CONFIG.CACHE_TTL_MS) {
  const expiresAt = Date.now() + ttl;
  cache.set(key, { value, expiresAt });
}
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

// --- Helpers: epidemiology and environmental -> risk mappings ---
function seasonalRiskBoost(date = new Date()) {
  const month = date.getMonth() + 1; // 1-12
  // Simplified seasonal multipliers per disease category
  const boost = {
    influenza: 1,
    dengue: 1,
    respiratory: 1,
  };

  if ([11,12,1,2].includes(month)) {
    boost.influenza = 1.3; // winter
    boost.respiratory = 1.2;
  }
  if ([6,7,8,9].includes(month)) {
    boost.dengue = 1.4; // monsoon-ish
    boost.respiratory = 1.05;
  }
  return boost;
}

// population density heuristic (people per km^2) -> multiplier
function populationDensityMultiplier(density) {
  if (!density || density <= 0) return 1;
  // baseline 1000 per km^2 -> small multiplier, high density gets higher
  return 1 + Math.min(2, (density - 1000) / 10000);
}

function computeTrendSlope(historyCases = []) {
  // historyCases: [{date, cases}, ...] ordered ascending
  if (!historyCases || historyCases.length < 2) return 0;
  const n = historyCases.length;
  const first = historyCases[0].cases || 0;
  const last = historyCases[n - 1].cases || 0;
  const days = (new Date(historyCases[n - 1].date) - new Date(historyCases[0].date)) / (1000 * 60 * 60 * 24) || 1;
  return (last - first) / days; // cases/day slope
}

// Parse Gemini response text into JSON robustly
function safeParseJSON(rawText) {
  if (!rawText) return null;
  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    // try to extract JSON substring
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e) { return null; }
    }
    return null;
  }
}

// --- Rule-based fallback detector ---
/**
 * Produces deterministic detections based on environmental and simple rules.
 * Returns { detectedPandemics: [], confidence: 'low'|'medium'|'high', analysis }
 */
function ruleBasedDetector({ region, weather = {}, aqi = {}, surgeProbability = 0, populationDensity = 0, trendSlope = 0 }) {
  const detected = [];
  const analysisParts = [];
  const seasonal = seasonalRiskBoost();

  // Respiratory issues from high AQI
  if (aqi?.aqi >= 150) {
    const est = Math.max(20, Math.round((aqi.aqi - 100) * 0.5));
    detected.push({
      diseaseName: 'Respiratory Infection',
      activeCases: est,
      newCasesLast24h: Math.round(est * 0.1),
      severity: est > 100 ? 'high' : 'moderate',
      transmissionRate: 1.2,
      affectedAgeGroups: ['children', 'adults', 'elderly'],
      symptoms: ['cough', 'wheeze', 'shortness of breath'],
      requiredMedicines: ['Bronchodilator', 'Steroids', 'Antibiotics (if secondary infection)'],
      notes: 'High AQI correlated with increased respiratory visits',
    });
    analysisParts.push('High AQI suggests respiratory burden');
  }

  // Vector-borne (dengue) risk: high temp + humidity + seasonal
  if ((weather.temperature || 0) >= 25 && (weather.humidity || 0) >= 70 && seasonal.dengue > 1) {
    const est = Math.round(10 * seasonal.dengue * (surgeProbability / 100 + 0.5));
    detected.push({
      diseaseName: 'Dengue-like Illness',
      activeCases: Math.max(5, est),
      newCasesLast24h: Math.max(1, Math.round(est * 0.15)),
      severity: 'moderate',
      transmissionRate: 1.1,
      affectedAgeGroups: ['children', 'adults'],
      symptoms: ['fever', 'joint pain', 'rash'],
      requiredMedicines: ['Paracetamol', 'Fluids'],
      notes: 'Warm humid conditions and seasonality increase vector risk',
    });
    analysisParts.push('Warm humid + seasonal boost -> vector-borne risk');
  }

  // Influenza / cold in low temperature
  if ((weather.temperature || 999) < 15 && seasonal.influenza > 1) {
    const est = Math.round(20 * seasonal.influenza * (1 + Math.max(0, trendSlope) / 10));
    detected.push({
      diseaseName: 'Influenza-like Illness',
      activeCases: Math.max(10, est),
      newCasesLast24h: Math.max(2, Math.round(est * 0.12)),
      severity: 'moderate',
      transmissionRate: 1.3,
      affectedAgeGroups: ['children', 'elderly'],
      symptoms: ['fever', 'cough', 'sore throat'],
      requiredMedicines: ['Antivirals (if indicated)', 'Paracetamol', 'Rest'],
      notes: 'Low temperature + seasonal pattern increases influenza risk',
    });
    analysisParts.push('Low temperature & seasonal influenza boost');
  }

  const confidence = detected.length > 0 ? (surgeProbability > 60 || detected.length > 1 ? 'high' : 'medium') : 'low';
  return { detectedPandemics: detected.slice(0, CONFIG.MAX_PANDEMICS_RETURNED), confidence, analysis: analysisParts.join('; ') || 'No strong signals detected by rule engine' };
}

// --- Gemini AI prompt builder ---
function buildGeminiPrompt({ region, weather = {}, aqi = {}, surgeProbability = 0, existingPandemics = [], populationDensity = null, trendSlope = 0 }) {
  const exampleJSON = `{
  "detectedPandemics": [
    {
      "diseaseName": "Influenza",
      "activeCases": 120,
      "newCasesLast24h": 12,
      "severity": "moderate",
      "transmissionRate": 1.4,
      "affectedAgeGroups": ["children","elderly"],
      "symptoms": ["fever","cough","body ache"],
      "requiredMedicines": ["Paracetamol","Oseltamivir"],
      "notes": "Example: influenza uptick due to low temperature and rising cases"
    }
  ],
  "confidence": "medium",
  "analysis": "short explanation"
}`;

  return `You are an epidemiologist AI. Be concise and output valid JSON EXACTLY like the example below. Only include up to ${CONFIG.MAX_PANDEMICS_RETURNED} detectedPandemics.

Example response:
${exampleJSON}

Current Conditions:
- Region: ${region}
- Surge Probability: ${surgeProbability}%
- Temperature: ${weather?.temperature ?? 'N/A'}\u00b0C
- Humidity: ${weather?.humidity ?? 'N/A'}%
- AQI: ${aqi?.aqi ?? 'N/A'}
- PM2.5: ${aqi?.pm25 ?? 'N/A'}\u03bcg/m3
- PM10: ${aqi?.pm10 ?? 'N/A'}\u03bcg/m3
- Population Density: ${populationDensity ?? 'unknown'} people/km^2
- Recent trend slope (cases/day): ${Number(trendSlope).toFixed(2)}

Existing Active Pandemics: ${existingPandemics.length > 0 ? JSON.stringify(existingPandemics.map(p => ({ name: p.diseaseName, cases: p.activeCases, severity: p.severity }))) : 'None'}

Consider seasonality, population density, and trend slope when estimating probable outbreaks. Only include pandemics if surgeProbability > ${CONFIG.SURGE_PROBABILITY_THRESHOLD}% or environmental conditions strongly suggest an outbreak. Limit output to JSON and do not include extra commentary.`;
}

// --- Gemini call with retry and safe parsing ---
async function callGeminiForDetection(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const modelName = GEMINI_MODEL || 'gemini-2.0-flash-exp';
    if (!modelName || modelName.trim() === '') {
      throw new Error('GEMINI_MODEL is not configured. Please set GEMINI_MODEL environment variable.');
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await withRetry(
      async () => await model.generateContent(prompt, { timeout: CONFIG.GEMINI_TIMEOUT_MS }),
      { maxRetries: CONFIG.GEMINI_MAX_RETRIES, initialDelay: 2000, maxDelay: 60000 }
    );

    const response = await result.response;
    const rawText = (await response.text()).trim();
    return safeParseJSON(rawText);
  } catch (err) {
    console.warn('Gemini call failed:', err?.message || err);
    return null;
  }
}

// --- Ensemble: combine Gemini + rules into final detections ---
function combineDetections(geminiResult, ruleResult) {
  // If GEMINI present and confidence high, prefer it; otherwise merge
  const final = [];
  const mapByName = new Map();

  const push = (src, item, weight = 1) => {
    const key = item.diseaseName.toLowerCase();
    if (!mapByName.has(key)) {
      mapByName.set(key, { ...item, _score: weight });
    } else {
      const existing = mapByName.get(key);
      // average numeric fields weighted by _score
      const totalWeight = existing._score + weight;
      existing.activeCases = Math.round((existing.activeCases * existing._score + item.activeCases * weight) / totalWeight);
      existing.newCasesLast24h = Math.round((existing.newCasesLast24h * existing._score + item.newCasesLast24h * weight) / totalWeight);
      existing.transmissionRate = Math.max(existing.transmissionRate, item.transmissionRate || 0);
      existing.requiredMedicines = Array.from(new Set([...(existing.requiredMedicines || []), ...(item.requiredMedicines || [])]));
      existing.symptoms = Array.from(new Set([...(existing.symptoms || []), ...(item.symptoms || [])]));
      existing._score = totalWeight;
      existing.severity = existing.severity === 'critical' || item.severity === 'critical' ? 'critical' : (existing.severity === 'high' || item.severity === 'high' ? 'high' : (existing.severity === 'moderate' || item.severity === 'moderate' ? 'moderate' : 'low'));
    }
  };

  if (geminiResult && Array.isArray(geminiResult.detectedPandemics)) {
    const geminiWeight = geminiResult.confidence === 'high' ? 3 : geminiResult.confidence === 'medium' ? 2 : 1;
    for (const p of geminiResult.detectedPandemics) push('gemini', p, geminiWeight);
  }

  if (ruleResult && Array.isArray(ruleResult.detectedPandemics)) {
    const ruleWeight = ruleResult.confidence === 'high' ? 2 : ruleResult.confidence === 'medium' ? 1.5 : 1;
    for (const p of ruleResult.detectedPandemics) push('rule', p, ruleWeight);
  }

  // Convert to array and sort
  Array.from(mapByName.values())
    .sort((a, b) => b.activeCases - a.activeCases)
    .slice(0, CONFIG.MAX_PANDEMICS_RETURNED)
    .forEach(p => final.push(p));

  // Derive ensemble confidence
  const ensembleConfidence = (geminiResult?.confidence === 'high' || ruleResult?.confidence === 'high') ? 'high' : (geminiResult?.confidence === 'medium' || ruleResult?.confidence === 'medium') ? 'medium' : 'low';

  return { detectedPandemics: final, confidence: ensembleConfidence, analysis: `${geminiResult?.analysis || ''}; ${ruleResult?.analysis || ''}`.trim() };
}

// --- Persistence helpers ---
async function persistOrUpdatePandemic(region, pandemic, surgeProbability, geminiAnalysisSummary = '') {
  // Thresholds to avoid creating noise
  if (pandemic.activeCases < CONFIG.MIN_ACTIVE_CASES_TO_PERSIST && pandemic.transmissionRate < CONFIG.MIN_TRANSMISSION_RATE_TO_PERSIST) {
    return null;
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await PandemicData.findOne({ region, diseaseName: pandemic.diseaseName, date: { $gte: twentyFourHoursAgo } });

  if (!existing) {
    const toSave = new PandemicData({
      region,
      date: new Date(),
      diseaseName: pandemic.diseaseName,
      activeCases: pandemic.activeCases,
      newCases: pandemic.newCasesLast24h || 0,
      recovered: Math.round((pandemic.activeCases || 0) * 0.2),
      deaths: Math.round((pandemic.activeCases || 0) * 0.005),
      severity: pandemic.severity || 'moderate',
      transmissionRate: pandemic.transmissionRate || 1,
      affectedAgeGroups: pandemic.affectedAgeGroups || [],
      symptoms: pandemic.symptoms || [],
      requiredMedicines: pandemic.requiredMedicines || [],
      notes: pandemic.notes || `Detected by ensemble. ${geminiAnalysisSummary}`,
      source: 'ensemble',
    });
    await toSave.save();
    return toSave;
  }

  // Update existing record conservatively
  existing.activeCases = Math.max(existing.activeCases, pandemic.activeCases || existing.activeCases);
  existing.newCases = Math.max(existing.newCases || 0, pandemic.newCasesLast24h || 0);
  existing.severity = pandemic.severity || existing.severity;
  existing.transmissionRate = pandemic.transmissionRate || existing.transmissionRate;
  existing.requiredMedicines = Array.from(new Set([...(existing.requiredMedicines || []), ...(pandemic.requiredMedicines || [])]));
  existing.symptoms = Array.from(new Set([...(existing.symptoms || []), ...(pandemic.symptoms || [])]));
  existing.notes = `${existing.notes || ''}\nUpdated: ${pandemic.notes || ''}`.trim();
  await existing.save();
  return existing;
}

// Public: getActivePandemics (improved)
export async function getActivePandemics(region, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const pandemics = await PandemicData.find({ region, date: { $gte: startDate }, activeCases: { $gt: 0 } }).sort({ date: -1, activeCases: -1 }).lean();

  // Keep latest per disease
  const diseaseMap = new Map();
  pandemics.forEach(p => {
    const key = p.diseaseName.toLowerCase();
    if (!diseaseMap.has(key) || new Date(diseaseMap.get(key).date) < new Date(p.date)) {
      diseaseMap.set(key, p);
    }
  });
  return Array.from(diseaseMap.values());
}

export async function getTotalActiveCases(region) {
  const active = await getActivePandemics(region, 7);
  return active.reduce((s, p) => s + (p.activeCases || 0), 0);
}

export async function getRequiredMedicinesFromPandemics(region) {
  const active = await getActivePandemics(region, 7);
  const meds = new Set();
  active.forEach(p => (p.requiredMedicines || []).forEach(m => meds.add(m)));
  return Array.from(meds);
}

export async function createPandemicData(data) {
  const doc = new PandemicData(data);
  await doc.save();
  return doc;
}

// Main analyze & persist flow (full rewrite)
export async function analyzeAndCreatePandemicData(region, weather = {}, aqi = null, surgeProbability = 0, options = {}) {
  try {
    const key = `analyze:${region}:${JSON.stringify({ weather, aqi, surgeProbability })}`;
    const cached = getCache(key);
    if (cached) return cached;

    // Quick exit if surgeProbability below configured threshold but still run rule-based if env strongly suggests
    const runAI = surgeProbability >= CONFIG.SURGE_PROBABILITY_THRESHOLD;

    // Gather context: population density and historical trend (user should provide or lookup)
    const populationDensity = options.populationDensity ?? null; // caller can pass this
    const history = options.historyCases ?? []; // array of {date, cases}
    const trendSlope = computeTrendSlope(history);

    // Existing pandemics
    const existingPandemics = await getActivePandemics(region, 14);

    // Build rule-based detection always
    const ruleResult = ruleBasedDetector({ region, weather, aqi, surgeProbability, populationDensity, trendSlope });

    // Call Gemini only when flagged or if rule suggests medium/high confidence
    let geminiResult = null;
    if (runAI || ruleResult.confidence !== 'low') {
      const prompt = buildGeminiPrompt({ region, weather, aqi, surgeProbability, existingPandemics, populationDensity, trendSlope });
      geminiResult = await callGeminiForDetection(prompt);
    }

    const ensemble = combineDetections(geminiResult || null, ruleResult || null);

    const createdRecords = [];
    if (ensemble.detectedPandemics && ensemble.detectedPandemics.length > 0) {
      for (const p of ensemble.detectedPandemics) {
        const rec = await persistOrUpdatePandemic(region, p, surgeProbability, ensemble.analysis || '');
        if (rec) createdRecords.push(rec);
      }
    } else {
      // No detections: perform cleanup of very old fallback data
      const hasRecentReal = await PandemicData.findOne({ region, date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, source: { $ne: 'basic-analysis' } });
      if (!hasRecentReal) {
        // remove stale basic-analysis records older than 7 days
        const deleted = await PandemicData.deleteMany({ region, date: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, source: 'basic-analysis' });
        if (deleted?.deletedCount) console.log(`Cleared ${deleted.deletedCount} stale fallback records for ${region}`);
      }
    }

    setCache(key, createdRecords);
    return createdRecords;
  } catch (err) {
    console.error('analyzeAndCreatePandemicData error:', err);
    return [];
  }
}

/**
 * Decay old active cases (call periodically via cron or scheduler)
 */
export async function decayOldPandemicCases(region, decayFactor = CONFIG.BASE_DECAY_FACTOR) {
  try {
    const records = await PandemicData.find({ region, activeCases: { $gt: 0 } });
    for (const r of records) {
      r.activeCases = Math.round(r.activeCases * decayFactor);
      if (r.activeCases < 1) r.activeCases = 0;
      await r.save();
    }
    return records.length;
  } catch (err) {
    console.error('decayOldPandemicCases error:', err);
    return 0;
  }
}

/**
 * Improved patient count estimator using weighted ensemble of factors
 */
export async function calculatePatientCountFromPandemics(region, basePatientCount, surgeProbability, options = {}) {
  try {
    const activePandemics = await getActivePandemics(region, 7);
    const seasonal = seasonalRiskBoost();
    const populationDensity = options.populationDensity ?? 1000;
    const densityMult = populationDensityMultiplier(populationDensity);

    // Surge contribution (0-50% as before)
    const surgeContribution = Math.round(basePatientCount * (surgeProbability / 100) * 0.5);

    // Pandemic new cases contribution: sum of newCases (use 30% hospitalization rate heuristic)
    const totalNewCases = activePandemics.reduce((s, p) => s + ((p.newCases || 0)), 0);
    const pandemicHospitalized = Math.round(totalNewCases * 0.3);

    // AQI respiratory factor (if provided via options or fetch latest)
    let aqiObj = options.aqi;
    if (!aqiObj) {
      try { aqiObj = await getLatestAqi(region); } catch (e) { aqiObj = null; }
    }
    const aqiFactor = aqiObj && aqiObj.aqi ? (aqiObj.aqi > 150 ? 0.05 * (aqiObj.aqi / 150) : 0.01) : 0;

    // Seasonality boost - simple average of relevant boosts
    const seasonBoost = Math.max(seasonal.influenza, seasonal.dengue, seasonal.respiratory) - 1;

    // Compose final estimate
    let estimated = basePatientCount + surgeContribution + pandemicHospitalized;

    // Apply multipliers
    estimated = Math.round(estimated * densityMult * (1 + seasonBoost + aqiFactor));

    // Outbreak multiplier if many new cases
    const outbreakMultiplier = totalNewCases > 50 ? 1.15 : totalNewCases > 20 ? 1.08 : 1.03;
    estimated = Math.round(estimated * outbreakMultiplier);

    // Bound the result: not less than base, not more than 2.5x base
    estimated = Math.min(Math.round(basePatientCount * 2.5), Math.max(basePatientCount, estimated));

    return estimated;
  } catch (err) {
    console.error('calculatePatientCountFromPandemics error:', err);
    // fallback to previous simple formula
    return Math.round(basePatientCount * (1 + (surgeProbability / 100) * 0.5));
  }
}

// Export some extra helpers for testing and orchestration
export default {
  getActivePandemics,
  getTotalActiveCases,
  getRequiredMedicinesFromPandemics,
  createPandemicData,
  analyzeAndCreatePandemicData,
  calculatePatientCountFromPandemics,
  decayOldPandemicCases,
};
