// controllers/enhancedVpsController.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class EnhancedVpsController {
  // Test endpoint without auth (for testing)
  async testAddVPS(req, res) {
    try {
      console.log('🧪 Testing VPS limits check...');
      
      // Get first user for testing
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name')
        .limit(1);
      
      if (!users || users.length === 0) {
        return res.json({
          success: false,
          message: 'No users found for testing'
        });
      }
      
      const userId = users[0].id;
      
      // Check if user has subscription
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans(name, max_vps)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      // Count existing VPS
      const { data: manualVPS } = await supabase
        .from('user_vps')
        .select('id')
        .eq('user_id', userId);

      const { data: provisionedServers } = await supabase
        .from('provisioned_servers')
        .select('id')
        .eq('user_id', userId);

      const totalVPS = (manualVPS?.length || 0) + (provisionedServers?.length || 0);

      const limits = {
        hasSubscription: !!subscription,
        currentVPS: totalVPS,
        maxVPS: subscription?.subscription_plans?.max_vps || 0,
        canAddMore: subscription ? totalVPS < subscription.subscription_plans.max_vps : false,
        planName: subscription?.subscription_plans?.name || 'No subscription'
      };
      
      res.json({
        success: true,
        testUser: users[0],
        limits: limits,
        message: 'VPS limits check completed'
      });

    } catch (error) {
      console.error('Test VPS error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Placeholder for other methods
  async getAllUserVPS(req, res) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  async addManualVPS(req, res) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
}

module.exports = new EnhancedVpsController();
