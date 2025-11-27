import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { generatePrediction, getLatestPrediction, getPredictionHistory } from '../services/predictionService.js';
import { getLatestAqi, getLatestWeather, getAqiHistory, getWeatherHistory, fetchAndStoreAqi, fetchAndStoreWeather } from '../services/dataService.js';
import { generatePDFReport } from '../services/pdfReportService.js';
import { extractCityName, isValidCityName, autoCorrectCityName } from '../utils/locationUtils.js';
import { sendPredictionToUser } from "../utils/sendPredictionToUser.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/predictions/predict
 * Generate a new prediction for a city
 * Accepts: city (required), date (optional), lat/lon (optional for auto-detection)
 */
router.post('/predict', requireAuth, async (req, res) => {
  try {
    let { city, date, lat, lon } = req.body;

    if (!city) {
      if (lat && lon) {
        return res.status(400).json({
          success: false,
          message: 'City name is required. Automatic location detection from coordinates is not yet implemented.',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    try {
      await fetchAndStoreAqi(city, '', 'India', true);
      await fetchAndStoreWeather(city, true);
    } catch (fetchError) {
      console.error(`Error fetching data for ${city}:`, fetchError.message);
    }

    const predictionDate = date ? new Date(date) : new Date();
    const prediction = await generatePrediction(city, predictionDate);

    // Send Telegram notification if user has Telegram linked
    try {
      const user = await User.findById(req.user.id);
      if (user && user.telegramChatId) {
        await sendPredictionToUser(user._id, prediction);
        console.log(`Telegram notification sent to user ${user.email}`);
      }
    } catch (telegramErr) {
      // Don't fail the request if Telegram notification fails
      console.error("Telegram notification failed:", telegramErr.message);
    }

    res.json({
      success: true,
      data: prediction,
    });

  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating prediction',
    });
  }
});


/**
 * GET /api/predictions/latest
 * Get latest prediction for a city
 * Query params: city (required), lat/lon (optional for auto-detection)
 */
router.get('/latest', requireAuth, async (req, res) => {
  try {
    let { city, lat, lon } = req.query;

    // If city is not provided, try to detect from lat/lon or return error
    if (!city) {
      if (lat && lon) {
        // TODO: Implement reverse geocoding
        return res.status(400).json({
          success: false,
          message: 'City name is required. Automatic location detection from coordinates is not yet implemented.',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    // Normalize city name
    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    // Use cached data (scheduler handles updates every 6 hours)
    // Don't fetch on every request to prevent rate limiting

    let prediction = await getLatestPrediction(city);

    // Generate new prediction if none exists or it's older than 6 hours
    if (!prediction || (new Date() - new Date(prediction.date)) > 6 * 60 * 60 * 1000) {
      // Fetch fresh data before generating prediction
      // Try weather first (required), then AQI (optional)
      try {
        await fetchAndStoreWeather(city, true);
      } catch (weatherError) {
        console.error(`Error fetching weather for ${city}:`, weatherError.message);
        // Weather is required, but continue to try AQI
      }
      
      try {
        await fetchAndStoreAqi(city, '', 'India', true);
      } catch (aqiError) {
        console.error(`Error fetching AQI for ${city}:`, aqiError.message);
        // AQI is optional, continue with prediction generation
      }
      
      try {
        prediction = await generatePrediction(city);
      } catch (predError) {
        console.error(`Error generating prediction for ${city}:`, predError.message);
        // If prediction fails, try to return cached data or error
        if (!prediction) {
          throw predError;
        }
      }
    }

    // Get latest AQI and Weather (use defaults if missing)
    let aqi = await getLatestAqi(city);
    let weather = await getLatestWeather(city);
    
    // If weather is still missing, we can't proceed
    if (!weather) {
      return res.status(500).json({
        success: false,
        message: `Weather data is required but not available for ${city}. Please check your WEATHER_API_KEY configuration.`,
      });
    }
    
    // If AQI is missing, create a default one
    if (!aqi) {
      const defaultAqi = weather.temperature > 35 ? 80 : weather.temperature > 25 ? 60 : 50;
      aqi = {
        aqi: defaultAqi,
        pm25: Math.round(defaultAqi * 0.6),
        pm10: Math.round(defaultAqi * 0.8),
        location: city,
        timestamp: new Date(),
        source: 'estimated',
      };
    }

    res.json({
      success: true,
      data: {
        prediction,
        aqi,
        weather,
      },
    });
  } catch (error) {
    console.error('Get latest prediction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching prediction',
    });
  }
});

/**
 * GET /api/predictions/history
 * Get prediction history for a city
 * Query params: city (required), days (optional, default: 30)
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    let { city, days = 30 } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    const history = await getPredictionHistory(city, parseInt(days));

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching history',
    });
  }
});

/**
 * GET /api/predictions/air-quality
 * Get air quality data for a city
 * Query params: city (required), since (optional), forceFetch (optional)
 */
router.get('/air-quality', requireAuth, async (req, res) => {
  try {
    let { city, since, forceFetch } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    // Only fetch if explicitly requested (scheduler handles regular updates every 6 hours)
    if (forceFetch === 'true') {
      await fetchAndStoreAqi(city, '', 'India', true);
    }

    if (since) {
      const history = await getAqiHistory(city, parseInt(since));
      res.json({
        success: true,
        data: history,
      });
    } else {
      const latest = await getLatestAqi(city);
      res.json({
        success: true,
        data: latest,
      });
    }
  } catch (error) {
    console.error('Get AQI error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching air quality',
    });
  }
});

/**
 * GET /api/predictions/weather
 * Get weather data for a city
 * Query params: city (required), since (optional)
 */
router.get('/weather', requireAuth, async (req, res) => {
  try {
    let { city, since } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    // Fetch fresh data when user requests (scheduler handles regular updates every 6 hours)
    try {
      await fetchAndStoreWeather(city, true);
    } catch (fetchError) {
      console.error(`Error fetching weather for ${city}:`, fetchError.message);
      // Continue with cached data if available
    }

    if (since) {
      const history = await getWeatherHistory(city, parseInt(since));
      res.json({
        success: true,
        data: history,
      });
    } else {
      const latest = await getLatestWeather(city);
      res.json({
        success: true,
        data: latest,
      });
    }
  } catch (error) {
    console.error('Get weather error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching weather',
    });
  }
});

/**
 * GET /api/predictions/staff-advice
 * Get staff advice for a city
 * Query params: city (required), date (optional)
 */
router.get('/staff-advice', requireAuth, async (req, res) => {
  try {
    let { city, date } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    let prediction = await getLatestPrediction(city);
    if (!prediction) {
      prediction = await generatePrediction(city, date ? new Date(date) : new Date());
    }

    res.json({
      success: true,
      data: prediction.staffAdvice || {},
    });
  } catch (error) {
    console.error('Get staff advice error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching staff advice',
    });
  }
});

/**
 * GET /api/predictions/supply-advice
 * Get supply advice for a city
 * Query params: city (required), date (optional)
 */
router.get('/supply-advice', requireAuth, async (req, res) => {
  try {
    let { city, date } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }

    let prediction = await getLatestPrediction(city);
    if (!prediction) {
      prediction = await generatePrediction(city, date ? new Date(date) : new Date());
    }

    res.json({
      success: true,
      data: prediction.supplyAdvice || {},
    });
  } catch (error) {
    console.error('Get supply advice error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching supply advice',
    });
  }
});

/**
 * GET /api/predictions/download
 * Download prediction data as PDF report
 * Query params: city (required), days (optional, default: 30)
 */
router.get('/download', requireAuth, async (req, res) => {
  try {
    let { city, days = 30 } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City name is required',
      });
    }

    city = extractCityName(city);
    city = autoCorrectCityName(city);
    if (!isValidCityName(city)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid city name provided',
      });
    }
    
    // Generate PDF report (using city as region for backward compatibility)
    const pdfBuffer = await generatePDFReport(city, parseInt(days));
    
    const filename = `mediops-predictions-${city}-${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating PDF report',
    });
  }
});

export default router;
