// controllers/subscriptionController.js
const { createClient } = require('@supabase/supabase-js');
const GoogleCloudService = require('../services/googleCloudService');
const jwt = require('jsonwebtoken');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class SubscriptionController {
  constructor() {
    this.googleCloud = new GoogleCloudService();
  }

  // Helper method to verify auth token
  async verifyAuthToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'Authorization required' };
    }

    const token = authHeader.split(' ')[1];

    try {
      // Use JWT secret to verify token
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret);
        return { 
          success: true, 
          user: {
            id: decoded.sub,
            email: decoded.email,
            user_metadata: decoded.user_metadata || {},
            plan_id: decoded.plan_id || null
          }
        };
      } else {
        // Fallback method - parse JWT manually
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          Buffer.from(base64, 'base64').toString().split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join('')
        );

        const payload = JSON.parse(jsonPayload);
        return { 
          success: true, 
          user: {
            id: payload.sub,
            email: payload.email,
            user_metadata: payload.user_metadata || {}
          }
        };
      }
    } catch (error) {
      console.error('❌ Auth error:', error.message);
      return { success: false, error: 'Invalid authentication' };
    }
  }

  // Get all available subscription plans
  async getPlans(req, res) {
    try {
      console.log('📋 Getting subscription plans...');

      const { data: plans, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) {
        console.error('Error fetching plans:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch subscription plans'
        });
      }

      res.json({
        success: true,
        data: plans || []
      });

    } catch (error) {
      console.error('Get plans error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Get user's current subscription
  async getCurrentSubscription(req, res) {
    try {
      const authResult = await this.verifyAuthToken(req.headers.authorization);

      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error
        });
      }

      const user = authResult.user;

      console.log(`🔍 Getting current subscription for user: ${user.email}`);

      // Get active subscription with plan details
      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans(*),
          provisioned_servers(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching subscription:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch subscription'
        });
      }

      res.json({
        success: true,
        data: subscription || null
      });

    } catch (error) {
      console.error('Get current subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Purchase a subscription plan
  purchaseSubscription = async (req, res) => {
    try {
      const authResult = await this.verifyAuthToken(req.headers.authorization);
      const { planId } = req.body;

      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error
        });
      }

      if (!planId) {
        return res.status(400).json({
          success: false,
          error: 'Plan ID is required'
        });
      }

      const user = authResult.user;

      console.log(`💳 Processing subscription purchase for user: ${user.email}`);
      console.log(`💳 Plan ID: ${planId}`);

      // Get plan details
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single();

      if (planError || !plan) {
        console.error('Plan not found error:', planError);
        return res.status(404).json({
          success: false,
          error: 'Subscription plan not found'
        });
      }

      console.log(`💳 Found plan: ${plan.name} - $${plan.price}`);

      // Check user's wallet balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_balance, total_spent')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        return res.status(404).json({
          success: false,
          error: 'User profile not found'
        });
      }

      const currentBalance = parseFloat(profile.wallet_balance || 0);
      const planPrice = parseFloat(plan.price);

      console.log(`💳 Current balance: ${currentBalance}, Plan price: ${planPrice}`);

      // Check if Free plan
      if (planPrice === 0) {
        console.log('💳 Processing free plan...');
        // Free plan - no payment required
        const result = await this.createSubscriptionAndServer(user.id, plan, null);
        return res.json(result);
      }

      // Check sufficient balance for paid plans
      if (currentBalance < planPrice) {
        console.log('💳 Insufficient balance');
        return res.status(400).json({
          success: false,
          error: 'Insufficient wallet balance',
          data: {
            required: planPrice,
            current: currentBalance,
            shortfall: planPrice - currentBalance
          }
        });
      }

      // Generate payment ID for subscription purchase
      const paymentId = `SUB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`💳 Creating transaction with payment_id: ${paymentId}`);

      // Create transaction record
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          payment_id: paymentId,
          type: 'subscription_purchase',
          amount: planPrice,
          description: `Purchase ${plan.name} subscription plan`,
          status: 'completed',
          payment_method: 'wallet',
          completed_at: new Date().toISOString(),
          metadata: { plan_id: planId, plan_name: plan.name }
        })
        .select()
        .single();

      if (txError) {
        console.error('Transaction creation error:', txError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create transaction'
        });
      }

      console.log(`💳 Transaction created: ${transaction.id}`);

      // Deduct from wallet balance
      const newBalance = currentBalance - planPrice;
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({
          wallet_balance: newBalance,
          total_spent: parseFloat(profile.total_spent || 0) + planPrice,
          last_payment_at: new Date().toISOString(),
          current_plan_id: planId
        })
        .eq('id', user.id);

      if (balanceError) {
        console.error('Balance update error:', balanceError);
        return res.status(500).json({
          success: false,
          error: 'Failed to update wallet balance'
        });
      }

      console.log(`💳 Wallet updated: ${currentBalance} → ${newBalance}`);

      // Create subscription and provision server
      const result = await this.createSubscriptionAndServer(user.id, plan, transaction.id);

      if (result.success) {
        console.log(`✅ Subscription purchased successfully for user: ${user.email}`);
        result.data.transaction = transaction;
        result.data.newBalance = newBalance;
      }

      res.json(result);

    } catch (error) {
      console.error('Purchase subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  // Create subscription and provision server
  async createSubscriptionAndServer(userId, plan, transactionId) {
    try {
      console.log(`🚀 Creating subscription and server for plan: ${plan.name}`);

      // Check for existing active subscription
      const { data: existingSubscription } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (existingSubscription) {
        console.log('⚠️ User already has active subscription');
        return {
          success: false,
          error: 'User already has an active subscription'
        };
      }

      // Create subscription record
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month from now

      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_id: plan.id,
          status: 'active',
          expires_at: expiresAt.toISOString(),
          auto_renew: false
        })
        .select()
        .single();

      if (subError) {
        console.error('Subscription creation error:', subError);
        return {
          success: false,
          error: 'Failed to create subscription'
        };
      }

      console.log(`📝 Subscription created: ${subscription.id}`);

      // For Free plan, don't provision server automatically
      if (plan.name === 'Free' || plan.name === 'Free Plan') {
        console.log('📝 Free plan activated - no server provisioning');
        return {
          success: true,
          data: {
            subscription: {
              ...subscription,
              subscription_plans: plan
            },
            server: null,
            message: 'Free subscription activated successfully. You can add VPS manually.'
          }
        };
      }

      // Provision Google Cloud server for paid plans
      let provisionedServer = null;
      try {
        const serverConfig = {
          name: `hexacloud-${userId.substring(0, 8)}-${Date.now()}`,
          zone: process.env.GOOGLE_CLOUD_DEFAULT_ZONE || 'asia-southeast1-a',
          machineType: this.getMachineTypeForPlan(plan.name),
          diskSize: plan.storage_gb.toString(),
          sourceImage: 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts',
          username: 'hexacloud',
          password: 'HexaCloud2024!',
          tags: ['hexacloud-vps', `plan-${plan.name.toLowerCase().replace(' ', '-')}`, 'http-server', 'https-server'],
          preemptible: false
        };

        console.log(`☁️ Provisioning Google Cloud server: ${serverConfig.name}`);
        const gcpInstance = await this.googleCloud.createInstance(serverConfig);

        // Save server details to database
        const { data: server, error: serverError } = await supabase
          .from('provisioned_servers')
          .insert({
            user_id: userId,
            subscription_id: subscription.id,
            name: serverConfig.name,
            gcp_instance_name: gcpInstance.name,
            zone: serverConfig.zone,
            machine_type: serverConfig.machineType,
            disk_size_gb: parseInt(serverConfig.diskSize),
            internal_ip: gcpInstance.internalIP,
            external_ip: gcpInstance.externalIP,
            status: 'running'
          })
          .select()
          .single();

        if (serverError) {
          console.error('Server record creation error:', serverError);
        } else {
          provisionedServer = server;
          console.log(`✅ Server provisioned successfully: ${server.external_ip}`);
        }

        // Update subscription with server reference
        if (server) {
          await supabase
            .from('user_subscriptions')
            .update({ server_id: server.id })
            .eq('id', subscription.id);
        }

      } catch (gcpError) {
        console.error('GCP provisioning error:', gcpError);
        // Continue without server if GCP fails - user can still use manual VPS
        console.log('⚠️ GCP provisioning failed, subscription still created');
      }

      return {
        success: true,
        data: {
          subscription: {
            ...subscription,
            subscription_plans: plan
          },
          server: provisionedServer,
          message: `${plan.name} subscription activated successfully${provisionedServer ? ' with server provisioned' : ''}`
        }
      };

    } catch (error) {
      console.error('Create subscription and server error:', error);
      return {
        success: false,
        error: 'Failed to create subscription and server'
      };
    }
  }

  // Get machine type based on plan
  getMachineTypeForPlan(planName) {
    const machineTypes = {
      'Free': 'e2-micro',
      'Free Plan': 'e2-micro',
      'Plus': 'e2-small',
      'Plus Plan': 'e2-small',
      'Pro': 'e2-medium',
      'Pro Plan': 'e2-medium'
    };
    return machineTypes[planName] || 'e2-micro';
  }

  // Get subscription detail by plan ID
  async getSubscriptionDetail(req, res) {
    try {
      const { planId } = req.query;
      console.log(planId);
      if (!planId) {
        return res.status(400).json({
          success: false,
          error: 'Missing planId in query'
        });
      }
      const { data: plan, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();
      console.log(plan);
      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch plan detail'
        });
      }
      res.json({
        success: true,
        data: plan || null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }
}

module.exports = new SubscriptionController();
