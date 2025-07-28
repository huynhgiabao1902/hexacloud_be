// routes/subscription.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`📋 Subscription API: ${req.method} ${req.originalUrl}`);
  next();
});

// Get all available subscription plans
router.get('/plans', subscriptionController.getPlans);

// Get user's current subscription
router.get('/current', subscriptionController.getCurrentSubscription);

// Purchase a subscription plan
router.post('/purchase', subscriptionController.purchaseSubscription);

// Get subscription detail by ID
router.get('/detail', subscriptionController.getSubscriptionDetail);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Subscription API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

// TEST ROUTE - Get current subscription without auth
router.get('/test-current', async (req, res) => {
  try {
    console.log('🧪 Testing current subscription without auth...');
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Get first user for testing
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name')
      .limit(1);
    
    if (!users || users.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No users found. Please register a user first.'
      });
    }
    
    const userId = users[0].id;
    console.log(`Testing with user: ${users[0].full_name || 'Unknown'}`);
    
    // Get subscription for test user
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans(*),
        provisioned_servers(*)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    res.json({
      success: true,
      data: subscription || null,
      testUser: users[0],
      message: subscription ? 'Found active subscription' : 'No active subscription found'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
