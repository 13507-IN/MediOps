import express from "express";
import { requireAuth } from "../middleware/auth.js";
import User from "../models/User.js";
const router = express.Router();

/**
 * POST /api/telegram/link
 * Body: { telegramChatId }
 * Protected route - links authenticated user's account to Telegram
 */
router.post("/link", requireAuth, async (req, res) => {
  try {
    const { telegramChatId } = req.body;
    if (!telegramChatId) {
      return res.status(400).json({ 
        success: false, 
        message: "telegramChatId is required" 
      });
    }

    // Get user from JWT token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    user.telegramChatId = String(telegramChatId);
    await user.save();

    return res.json({ 
      success: true, 
      message: "Telegram account linked successfully",
      data: {
        email: user.email,
        telegramChatId: user.telegramChatId
      }
    });
  } catch (err) {
    console.error("Error linking Telegram:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

/**
 * POST /api/telegram/unlink
 * Protected route - unlinks authenticated user's Telegram account
 */
router.post("/unlink", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    user.telegramChatId = null;
    await user.save();

    return res.json({ 
      success: true, 
      message: "Telegram account unlinked successfully"
    });
  } catch (err) {
    console.error("Error unlinking Telegram:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

/**
 * GET /api/telegram/status
 * Protected route - checks if user has linked their Telegram account
 */
router.get("/status", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    return res.json({ 
      success: true, 
      data: {
        isLinked: !!user.telegramChatId,
        telegramChatId: user.telegramChatId || null
      }
    });
  } catch (err) {
    console.error("Error checking Telegram status:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

export default router;
