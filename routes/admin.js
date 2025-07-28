// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`👑 Admin API: ${req.method} ${req.originalUrl}`);
  next();
});

// Admin authentication middleware for protected routes
router.use(['/dashboard', '/users', '/reviews', '/activities'], adminController.checkAdminAuth);

// Public endpoints
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Admin API is running',
    timestamp: new Date().toISOString()
  });
});

// Protected admin endpoints
router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.get('/reviews', adminController.getAllReviews);
router.post('/reviews/:reviewId/respond', adminController.respondToReview);
router.get('/activities', adminController.getRecentActivities);

// Test endpoint (for development)
router.get('/test', adminController.testAdmin);

module.exports = router;
