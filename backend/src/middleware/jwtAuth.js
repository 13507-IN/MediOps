import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const buildTokenPayload = (user) => {
  if (!user) return null;
  const id = user._id ? user._id.toString() : user.id;
  return {
    id,
    email: user.email,
    hospitalId: user.hospitalId,
    hospitalName: user.hospitalName,
  };
};

// Middleware to verify JWT token
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // If token doesn't have hospital info, fetch from database
      if ((!decoded.hospitalId || !decoded.hospitalName) && decoded.id) {
        const user = await User.findById(decoded.id).select('hospitalId hospitalName email');
        if (user) {
          decoded.hospitalId = user.hospitalId;
          decoded.hospitalName = user.hospitalName;
        }
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

// Generate JWT token
export const generateToken = (user) => {
  const payload = buildTokenPayload(user);
  if (!payload) {
    throw new Error('Unable to build token payload');
  }
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Refresh token (optional)
export const refreshToken = (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const newToken = generateToken(decoded);

    res.json({
      success: true,
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
    });
  }
};
