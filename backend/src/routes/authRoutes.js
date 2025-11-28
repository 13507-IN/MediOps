import express from 'express';
import User from '../models/User.js';
import { generateToken, verifyToken } from '../middleware/jwtAuth.js';

const router = express.Router();

// Helper function to normalize hospital ID
const normalizeHospitalId = (value = '') => {
  return value
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .substring(0, 20);
};

// Helper function to generate unique hospital ID
const generateHospitalId = async (hospitalName) => {
  const base = normalizeHospitalId(hospitalName) || 'HOSP';
  let candidate;
  let attempts = 0;

  do {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    candidate = `HOSP-${base.substring(0, 4)}${suffix}`;
    const existing = await User.findOne({ hospitalId: candidate });
    if (!existing) {
      return candidate;
    }
    attempts += 1;
  } while (attempts < 5);

  return `HOSP-${Date.now().toString().slice(-6)}`;
};

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName = '', lastName = '', hospitalName, hospitalId } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Validate hospital name
    if (!hospitalName || !hospitalName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Hospital name is required',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Generate or validate hospital ID
    let finalHospitalId = hospitalId ? normalizeHospitalId(hospitalId) : null;
    
    if (!finalHospitalId) {
      // Auto-generate hospital ID
      finalHospitalId = await generateHospitalId(hospitalName);
    } else {
      // Check if hospital ID already exists
      const existingHospital = await User.findOne({ hospitalId: finalHospitalId });
      if (existingHospital) {
        return res.status(409).json({
          success: false,
          message: 'Hospital ID already exists. Please choose a different one or leave it empty to auto-generate.',
        });
      }
    }

    // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      hospitalName: hospitalName.trim(),
      hospitalId: finalHospitalId,
    });

    await user.save();

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        hospitalName: user.hospitalName,
        hospitalId: user.hospitalId,
        token,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error during signup',
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account is disabled',
      });
    }

    // Compare passwords
    const isPasswordMatch = await user.matchPassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        hospitalName: user.hospitalName,
        hospitalId: user.hospitalId,
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error during login',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (just returns success - token is managed client-side)
 */
router.post('/logout', verifyToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during logout',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
    });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating profile',
    });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All password fields are required',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isPasswordMatch = await user.matchPassword(currentPassword);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error changing password',
    });
  }
});

export default router;