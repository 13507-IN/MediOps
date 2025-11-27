import Prediction from '../models/Prediction.js';
import HospitalStats from '../models/HospitalStats.js';
import { getLatestAqi, getLatestWeather, getAqiHistory, getWeatherHistory, fetchAndStoreAqi, fetchAndStoreWeather } from './dataService.js';
import { runOperationsAgent } from './geminiService.js';
import { getDiseasesForConditions, getMedicinesForDiseases } from './diseaseMedicineService.js';
import { 
  analyzeAndCreatePandemicData, 
  calculatePatientCountFromPandemics,
  getActivePandemics,
  getRequiredMedicinesFromPandemics 
} from './pandemicService.js';
import { GEMINI_MODEL } from '../utils/geminiConfig.js';

/**
 * Calculate surge probability based on features
 * Uses weighted scoring system to prevent absurd numbers
 */
function calculateSurgeProbability(features) {
  let score = 0;
  const maxScore = 100;

  // AQI impact (0-30 points)
  if (features.aqi >= 300) score += 30; // Hazardous
  else if (features.aqi >= 200) score += 25; // Very Unhealthy
  else if (features.aqi >= 150) score += 20; // Unhealthy
  else if (features.aqi >= 100) score += 12; // Unhealthy for Sensitive Groups
  else if (features.aqi >= 50) score += 5; // Moderate
  // Below 50 is good, no points added

  // Temperature impact (0-25 points)
  // Extreme heat (40°C+) - highest risk
  if (features.temperature >= 40) score += 25;
  // Very hot (35-40°C) - high risk
  else if (features.temperature >= 35) score += 18;
  // Hot (30-35°C) - moderate risk
  else if (features.temperature >= 30) score += 10;
  // Cold weather (below 10°C) - moderate risk
  else if (features.temperature < 10) score += 12;
  // Very cold (below 5°C) - higher risk
  else if (features.temperature < 5) score += 18;
  // Normal temperatures (10-30°C) - minimal risk
  else score += 2;

  // Humidity impact (0-10 points)
  if (features.humidity >= 90) score += 10; // Very high humidity
  else if (features.humidity >= 80) score += 6; // High humidity
  else if (features.humidity < 30) score += 4; // Very low humidity (dry conditions)

  // Precipitation impact (0-8 points)
  if (features.precipitation >= 50) score += 8; // Heavy rain/flooding
  else if (features.precipitation >= 20) score += 5; // Moderate rain
  else if (features.precipitation >= 5) score += 3; // Light rain

  // Historical admissions impact (0-20 points)
  const admissionRatio = features.admissionsLast7dAvg / features.baselineAdmissions;
  if (admissionRatio >= 2.0) score += 20; // Double the baseline
  else if (admissionRatio >= 1.5) score += 15; // 50% above baseline
  else if (admissionRatio >= 1.2) score += 10; // 20% above baseline
  else if (admissionRatio >= 1.0) score += 5; // At or above baseline

  // Festival impact (0-10 points)
  if (features.isFestival) {
    score += Math.min(10, features.festivalMultiplier * 5);
  }

  // Normalize to 0-100 probability
  // Use a sigmoid-like curve to prevent extreme values
  const normalized = Math.min(100, Math.max(0, score));
  
  // Apply smoothing to prevent sudden jumps
  return Math.round(normalized);
}

/**
 * Generate predictions with AI agent
 * @param {string} cityName - City name (e.g., "Delhi", "Mumbai")
 * @param {Date} date - Date for prediction (default: today)
 */
export async function generatePrediction(cityName, date = new Date()) {
  try {
    if (!cityName) {
      throw new Error('City name is required');
    }

    // Fetch latest data for the city - try to fetch if missing
    let aqi = await getLatestAqi(cityName);
    let weather = await getLatestWeather(cityName);
    
    // If weather is missing, try to fetch it (required)
    if (!weather) {
      console.log(`⚠️ No weather data found for ${cityName}, attempting to fetch...`);
      try {
        weather = await fetchAndStoreWeather(cityName, true);
      } catch (weatherError) {
        console.error(`❌ Failed to fetch weather for ${cityName}:`, weatherError.message);
        throw new Error(`Weather data is required but could not be fetched for ${cityName}. Please check your WEATHER_API_KEY configuration.`);
      }
    }
    
    // If AQI is missing, try to fetch it (optional - use defaults if it fails)
    if (!aqi) {
      console.log(`⚠️ No AQI data found for ${cityName}, attempting to fetch...`);
      try {
        aqi = await fetchAndStoreAqi(cityName, '', 'India', true);
      } catch (aqiError) {
        console.error(`❌ Failed to fetch AQI for ${cityName}:`, aqiError.message);
        console.log(`⚠️ Using default AQI values based on weather conditions`);
        // Use default AQI values based on weather conditions
        // Higher temperature and low humidity might indicate higher pollution
        const defaultAqi = weather.temperature > 35 ? 80 : weather.temperature > 25 ? 60 : 50;
        aqi = {
          aqi: defaultAqi,
          pm25: Math.round(defaultAqi * 0.6),
          pm10: Math.round(defaultAqi * 0.8),
          location: cityName,
          timestamp: new Date(),
          source: 'estimated',
        };
      }
    }
    
    const aqiHistory = await getAqiHistory(cityName, 7);
    const weatherHistory = await getWeatherHistory(cityName, 7);

    // Get hospital stats (using cityName as region identifier for backward compatibility)
    const hospitalStats = await HospitalStats.find({ region: cityName })
      .sort({ date: -1 })
      .limit(7)
      .lean();

    const admissionsLast7d = hospitalStats.map(s => s.admissions);
    const admissionsLast7dAvg = admissionsLast7d.length > 0
      ? admissionsLast7d.reduce((a, b) => a + b, 0) / admissionsLast7d.length
      : 50;

    // Calculate dynamic baseline based on historical data
    // If we have historical data, use the average; otherwise use a reasonable default
    const baselineAdmissions = admissionsLast7d.length > 0
      ? Math.max(30, Math.min(100, admissionsLast7dAvg * 0.8)) // 80% of recent average, bounded
      : 50; // Default baseline

    // Validate that we have required data
    if (!aqi || !weather) {
      throw new Error(`Missing data for city ${cityName}. AQI and Weather data are required.`);
    }

    // Build features
    const features = {
      city: cityName,
      date: date.toISOString(),
      aqi: aqi.aqi,
      pm25: aqi.pm25,
      pm10: aqi.pm10,
      temperature: weather.temperature,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      precipitation: weather.precipitation,
      admissionsLast7dAvg,
      baselineAdmissions,
      isFestival: false,
      festivalMultiplier: 0,
    };

    // Calculate surge probability
    const surgeProbability = calculateSurgeProbability(features);

    // Use AI agent to generate detailed advice
    const agentContext = {
      city: cityName,
      date: date.toISOString(),
      features,
      surgeProbability,
      aqi: aqi.aqi,
      weather: {
        temperature: weather.temperature,
        humidity: weather.humidity,
      },
    };

    const agentResponse = await runOperationsAgent(
      `Generate detailed prediction and recommendations for ${cityName} city on ${date.toISOString().split('T')[0]}. Surge probability: ${surgeProbability}%. AQI: ${features.aqi}, Temperature: ${features.temperature}°C, Humidity: ${features.humidity}%.`,
      agentContext
    );

    // Get real diseases and medicines from API
    const suggestedDiseases = await getDiseasesForConditions(weather, aqi, surgeProbability);
    const suggestedMedicines = await getMedicinesForDiseases(suggestedDiseases, weather, aqi);

    // Analyze and create pandemic data if conditions indicate potential outbreak
    const pandemicData = await analyzeAndCreatePandemicData(cityName, weather, aqi, surgeProbability);
    
    // Get active pandemics for this city
    const activePandemics = await getActivePandemics(cityName, 7);
    
    // Get required medicines from active pandemics
    const pandemicMedicines = await getRequiredMedicinesFromPandemics(cityName);
    
    // Combine medicines from conditions and pandemics
    const allMedicines = [...new Set([...suggestedMedicines, ...pandemicMedicines])];

    // Calculate estimated FUTURE patient count based on current conditions
    // This predicts NEW patients that may arrive, NOT accumulated historical cases
    // Base patient count represents typical daily admissions
    const basePatientCount = Math.max(30, Math.min(150, baselineAdmissions));
    
    // Calculate future patient count based on:
    // 1. Baseline admissions (historical average)
    // 2. Current surge probability (environmental factors)
    // 3. Active pandemics (new cases rate, not accumulated cases)
    const estimatedPatientCount = await calculatePatientCountFromPandemics(
      cityName, 
      basePatientCount, 
      surgeProbability
    );

    // Create prediction record (using cityName as region for backward compatibility with schema)
    const prediction = new Prediction({
      region: cityName,
      date,
      surgeProbability,
      estimatedPatientCount,
      modelVersion: GEMINI_MODEL,
      inputSnapshot: features,
      staffAdvice: {
        // More realistic staffing calculations
        doctors: Math.max(5, Math.ceil(8 + (surgeProbability / 100) * 12)),
        nurses: Math.max(10, Math.ceil(15 + (surgeProbability / 100) * 25)),
        supportStaff: Math.max(3, Math.ceil(4 + (surgeProbability / 100) * 8)),
        notes: agentResponse.staffingPlan || 'Standard staffing levels',
      },
      supplyAdvice: {
        // More realistic supply calculations
        oxygen: Math.max(500, Math.ceil(800 + (surgeProbability / 100) * 700)),
        medicines: allMedicines,
        ppe: Math.max(200, Math.ceil(300 + (surgeProbability / 100) * 400)),
        notes: agentResponse.supplyPlan || 'Standard supply levels',
      },
      topFactors: [
        { feature: 'aqi', impact: features.aqi > 100 ? 0.3 : 0.1 },
        { feature: 'temperature', impact: features.temperature > 35 ? 0.25 : 0.1 },
        { feature: 'admissions_trend', impact: admissionsLast7dAvg > 60 ? 0.2 : 0.1 },
      ],
      suggestedMedicines: allMedicines,
      suggestedDiseases,
      activePandemics: activePandemics.map(p => ({
        diseaseName: p.diseaseName,
        activeCases: p.activeCases,
        newCases: p.newCases,
        severity: p.severity,
        transmissionRate: p.transmissionRate,
      })),
      weatherImpact: agentResponse.weatherImpact || 'Normal weather conditions',
      aqiImpact: agentResponse.aqiImpact || 'Normal air quality',
    });

    await prediction.save();
    return prediction;
  } catch (error) {
    console.error('Error generating prediction:', error);
    throw error;
  }
}


/**
 * Get prediction history for a city
 * @param {string} cityName - City name
 * @param {number} days - Number of days of history
 */
export async function getPredictionHistory(cityName, days = 30) {
  if (!cityName) {
    return [];
  }
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await Prediction.find({
    region: cityName, // Using region field for backward compatibility
    date: { $gte: startDate },
  })
    .sort({ date: -1 })
    .lean();
}

/**
 * Get latest prediction for a city
 * @param {string} cityName - City name
 */
export async function getLatestPrediction(cityName) {
  if (!cityName) {
    return null;
  }
  return await Prediction.findOne({ region: cityName }) // Using region field for backward compatibility
    .sort({ date: -1 })
    .lean();
}

