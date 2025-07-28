// routes/payment.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`💰 Payment API: ${req.method} ${req.originalUrl}`);
  next();
});

// Create deposit payment
router.post('/deposit', paymentController.createDepositPayment);

// Purchase subscription payment
router.post('/purchase', paymentController.purchaseSubscriptionPayment);

// PayOS webhook
router.post('/webhook', paymentController.handlePaymentWebhook);

// Check payment status
router.get('/status/:transactionId', paymentController.checkPaymentStatus);

// Test payment (sandbox)
router.post('/test', paymentController.testPayment);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Payment API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
