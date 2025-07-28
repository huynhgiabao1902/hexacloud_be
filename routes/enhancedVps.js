// routes/enhancedVps.js
const express = require('express');
const router = express.Router();
const enhancedVpsController = require('../controllers/enhancedVpsController');

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`🖥️ Enhanced VPS API: ${req.method} ${req.originalUrl}`);
  next();
});

// Get all VPS for authenticated user
router.get('/', enhancedVpsController.getAllUserVPS);

// Add manual VPS with validation
router.post('/manual', enhancedVpsController.addManualVPS);

// Test endpoint (no auth required)
router.get('/test-limits', enhancedVpsController.testAddVPS);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Enhanced VPS API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
