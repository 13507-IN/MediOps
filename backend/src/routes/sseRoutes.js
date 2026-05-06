import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addClient } from '../utils/sseManager.js';

const router = express.Router();

/**
 * GET /api/sse
 * SSE endpoint for real-time updates
 * Clients connect here to receive live events
 */
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  console.log(`📡 SSE client connected for user: ${userId}`);
  addClient(userId, req, res);
});

export default router;
