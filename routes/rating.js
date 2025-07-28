// routes/rating.js
const express = require('express');
const router = express.Router();
const ratingController = require('../controllers/ratingController');

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`⭐ Rating API: ${req.method} ${req.originalUrl}`);
  next();
});

// Submit a review
router.post('/submit', ratingController.submitReview);

// Get public reviews
router.get('/public', ratingController.getPublicReviews);

// Test create review (no auth required)
router.post('/test-create', ratingController.testCreateReview);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Rating API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
