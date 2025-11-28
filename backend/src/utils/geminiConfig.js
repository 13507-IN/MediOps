/**
 * Gemini AI Configuration
 * Centralized configuration for Gemini model selection
 */

// Use gemini-2.0-flash-exp as requested by user
// Valid models for v1beta: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';


