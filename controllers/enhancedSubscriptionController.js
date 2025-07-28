// controllers/enhancedSubscriptionController.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class EnhancedSubscriptionController {
  // Purchase subscription with payment integration
  async purchaseSubscriptionWithPayment(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const { planId, paymentMethod = 'wallet' } = req.body;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      const token = authHeader.split(' ')[1];
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication'
        });
      }

      // Get plan details
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (planError || !plan) {
        return res.status(404).json({
          success: false,
          error: 'Plan not found'
        });
      }

      // Check user's wallet balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .single();

      if (profileError) {
        return res.status(404).json({
          success: false,
          error: 'User profile not found'
        });
      }

      const currentBalance = parseFloat(profile.wallet_balance || 0);
      const planPrice = parseFloat(plan.price);

      // Free plan
      if (planPrice === 0) {
        return this.createFreeSubscription(user.id, plan, res);
      }

      // Check payment method
      if (paymentMethod === 'wallet') {
        if (currentBalance < planPrice) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient wallet balance',
            data: {
              required: planPrice,
              current: currentBalance,
              shortfall: planPrice - currentBalance,
              suggestion: 'Please deposit more funds to your wallet'
            }
          });
        }

        // Process wallet payment
        return this.processWalletPayment(user, plan, currentBalance, res);
      } else {
        // Direct payment with PayOS
        return this.processDirectPayment(user, plan, res);
      }

    } catch (error) {
      console.error('Purchase subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Create free subscription
  async createFreeSubscription(userId, plan, res) {
    try {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_id: plan.id,
          status: 'active',
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create subscription'
        });
      }

      res.json({
        success: true,
        data: {
          subscription: { ...subscription, subscription_plans: plan },
          message: 'Free subscription activated successfully'
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create free subscription'
      });
    }
  }

  // Process wallet payment
  async processWalletPayment(user, plan, currentBalance, res) {
    try {
      const planPrice = parseFloat(plan.price);
      const newBalance = currentBalance - planPrice;

      // Create transaction
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          payment_id: `SUB_${Date.now()}`,
          type: 'subscription_purchase',
          amount: planPrice,
          description: `Purchase ${plan.name} subscription`,
          status: 'completed',
          payment_method: 'wallet',
          completed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (txError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create transaction'
        });
      }

      // Update wallet balance
      await supabase
        .from('profiles')
        .update({
          wallet_balance: newBalance,
          total_spent: parseFloat(profile.total_spent || 0) + planPrice
        })
        .eq('id', user.id);

      // Create subscription
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          status: 'active',
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single();

      if (subError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create subscription'
        });
      }

      res.json({
        success: true,
        data: {
          subscription: { ...subscription, subscription_plans: plan },
          transaction,
          newBalance,
          message: 'Subscription purchased successfully with wallet'
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to process wallet payment'
      });
    }
  }

  // Process direct payment
  async processDirectPayment(user, plan, res) {
    res.json({
      success: false,
      error: 'Direct payment not implemented yet',
      message: 'Please use wallet payment or contact support'
    });
  }
}

module.exports = new EnhancedSubscriptionController();
