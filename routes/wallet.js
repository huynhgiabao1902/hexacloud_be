// routes/wallet.js
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`💰 Wallet API: ${req.method} ${req.originalUrl}`);
  next();
});

// Get wallet balance
router.get('/balance', walletController.getBalance);

// Get transaction history
router.get('/history', walletController.getTransactionHistory);

// Process deposit (called after payment success)
router.post('/deposit/process', walletController.processDeposit);

// Check if user has enough balance
router.get('/check-balance', walletController.checkBalance);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Wallet API is running',
    timestamp: new Date().toISOString()
  });
});
// Check and process pending payments
router.post('/check-pending', walletController.checkAndProcessPendingPayments);

// Cancel transaction
router.post('/cancel-transaction', walletController.cancelTransaction);

module.exports = router;
