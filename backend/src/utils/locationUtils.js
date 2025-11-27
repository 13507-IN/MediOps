/**
 * Location utilities for automatic location detection and city name normalization
 */

/**
 * Normalize city name (capitalize first letter, trim whitespace)
 * @param {string} cityName - City name
 * @returns {string} Normalized city name
 */
export function normalizeCityName(cityName) {
  if (!cityName || typeof cityName !== 'string') {
    return null;
  }
  
  return cityName.trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extract city name from location string
 * Handles formats like "City, State", "City, State, Country", "City"
 * @param {string} location - Location string
 * @returns {string} City name
 */
export function extractCityName(location) {
  if (!location || typeof location !== 'string') {
    return null;
  }

  // If it contains commas, take the first part (city name)
  if (location.includes(',')) {
    return normalizeCityName(location.split(',')[0]);
  }

  return normalizeCityName(location);
}

/**
 * Validate city name
 * @param {string} cityName - City name to validate
 * @returns {boolean} True if valid
 */
export function isValidCityName(cityName) {
  if (!cityName || typeof cityName !== 'string') {
    return false;
  }
  
  // Basic validation: at least 2 characters, only letters, spaces, and common punctuation
  const cityNameRegex = /^[a-zA-Z\s\-'\.]{2,}$/;
  return cityNameRegex.test(cityName.trim());
}

/**
 * Common city name corrections (typos -> correct names)
 */
const CITY_CORRECTIONS = {
  'kolkato': 'Kolkata',
  'kolkatta': 'Kolkata',
  'calcutta': 'Kolkata',
  'mumbai': 'Mumbai',
  'bombay': 'Mumbai',
  'delhi': 'Delhi',
  'new delhi': 'Delhi',
  'bangalore': 'Bangalore',
  'bengaluru': 'Bangalore',
  'chennai': 'Chennai',
  'madras': 'Chennai',
  'hyderabad': 'Hyderabad',
  'pune': 'Pune',
  'ahmedabad': 'Ahmedabad',
  'surat': 'Surat',
  'jaipur': 'Jaipur',
  'lucknow': 'Lucknow',
  'kanpur': 'Kanpur',
  'nagpur': 'Nagpur',
  'indore': 'Indore',
  'thane': 'Thane',
  'bhopal': 'Bhopal',
  'visakhapatnam': 'Visakhapatnam',
  'patna': 'Patna',
  'vadodara': 'Vadodara',
  'ghaziabad': 'Ghaziabad',
  'ludhiana': 'Ludhiana',
  'agra': 'Agra',
  'nashik': 'Nashik',
  'faridabad': 'Faridabad',
  'meerut': 'Meerut',
  'rajkot': 'Rajkot',
  'varanasi': 'Varanasi',
  'srinagar': 'Srinagar',
  'amritsar': 'Amritsar',
  'jodhpur': 'Jodhpur',
  'raipur': 'Raipur',
  'ranchi': 'Ranchi',
  'chandigarh': 'Chandigarh',
  'kochi': 'Kochi',
  'cochin': 'Kochi',
  'coimbatore': 'Coimbatore',
  'vijayawada': 'Vijayawada',
  'madurai': 'Madurai',
  'guwahati': 'Guwahati',
  'jamshedpur': 'Jamshedpur',
  'hubli': 'Hubli',
  'dharwad': 'Dharwad',
  'mysore': 'Mysore',
  'mysuru': 'Mysore',
};

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Auto-correct city name (handles typos and common misspellings)
 * @param {string} cityName - City name (potentially misspelled)
 * @returns {string} Corrected city name
 */
export function autoCorrectCityName(cityName) {
  if (!cityName || typeof cityName !== 'string') {
    return cityName;
  }

  const normalized = cityName.trim().toLowerCase();
  
  // First, check direct corrections
  if (CITY_CORRECTIONS[normalized]) {
    return CITY_CORRECTIONS[normalized];
  }

  // If no direct match, try fuzzy matching
  let bestMatch = null;
  let minDistance = Infinity;
  const threshold = 2; // Maximum allowed edit distance

  for (const [wrong, correct] of Object.entries(CITY_CORRECTIONS)) {
    const distance = levenshteinDistance(normalized, wrong);
    if (distance < minDistance && distance <= threshold) {
      minDistance = distance;
      bestMatch = correct;
    }
  }

  // Also check against correct city names directly
  if (!bestMatch) {
    for (const correctCity of Object.values(CITY_CORRECTIONS)) {
      const distance = levenshteinDistance(normalized, correctCity.toLowerCase());
      if (distance < minDistance && distance <= threshold) {
        minDistance = distance;
        bestMatch = correctCity;
      }
    }
  }

  return bestMatch || normalizeCityName(cityName);
}

