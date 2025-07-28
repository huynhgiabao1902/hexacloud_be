// controllers/walletController.js
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

class WalletController {
  // Get wallet balance
  async getBalance(req, res) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      const token = authHeader.split(' ')[1];

      // Verify token with Supabase
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication'
        });
      }

      console.log(`💰 Getting wallet balance for user: ${user.email}`);

      // Get user profile with wallet balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, wallet_balance, current_plan_id, total_spent')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      // Get current plan details if exists
      let currentPlan = null;
      if (profile.current_plan_id) {
        const { data: planData } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', profile.current_plan_id)
          .single();

        currentPlan = planData;
      }

      // Get active subscription if exists
      const { data: activeSubscription } = await supabase
        .from('user_subscriptions')
        .select('*, subscription_plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      res.json({
        success: true,
        data: {
          balance: parseFloat(profile.wallet_balance || 0),
          totalSpent: parseFloat(profile.total_spent || 0),
          currentPlan: currentPlan,
          activeSubscription: activeSubscription,
          profile: {
            id: profile.id,
            fullName: profile.full_name
          }
        }
      });

    } catch (error) {
      console.error('Get balance error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Get transaction history
  async getTransactionHistory(req, res) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      const token = authHeader.split(' ')[1];

      // Verify token
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication'
        });
      }

      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;

      console.log(`📋 Getting transaction history for user: ${user.email}`);

      // Build query
      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter by status if provided
      if (status) {
        query = query.eq('status', status);
      }

      const { data: transactions, error, count } = await query;

      if (error) {
        console.error('Transaction query error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch transactions'
        });
      }

      res.json({
        success: true,
        data: {
          transactions: transactions || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get transaction history error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Process deposit (after payment success)
  async processDeposit(req, res) {
    try {
      const { transactionId, userId } = req.body;

      if (!transactionId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID and User ID required'
        });
      }

      console.log(`💳 Processing deposit for transaction: ${transactionId}`);

      // Get transaction details
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('user_id', userId)
        .single();

      if (txError || !transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      // Check if already processed
      if (transaction.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Transaction already processed'
        });
      }

      // Start transaction
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', userId)
        .single();

      if (profileError) {
        return res.status(404).json({
          success: false,
          error: 'User profile not found'
        });
      }

      const currentBalance = parseFloat(profile.wallet_balance || 0);
      const depositAmount = parseFloat(transaction.amount);
      const newBalance = currentBalance + depositAmount;

      // Update wallet balance
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          wallet_balance: newBalance,
          total_spent: 0 // Will update when purchasing
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Update balance error:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Failed to update balance'
        });
      }

      // Update transaction status
      const { error: txUpdateError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      if (txUpdateError) {
        console.error('Update transaction error:', txUpdateError);
      }

      console.log(`✅ Deposit processed successfully. New balance: ${newBalance}`);

      res.json({
        success: true,
        data: {
          transactionId,
          amount: depositAmount,
          newBalance: newBalance,
          message: 'Deposit processed successfully'
        }
      });

    } catch (error) {
      console.error('Process deposit error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Check if user has enough balance
  async checkBalance(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const { amount } = req.query;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid amount required'
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

      // Get current balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .single();

      if (profileError) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const currentBalance = parseFloat(profile.wallet_balance || 0);
      const requiredAmount = parseFloat(amount);
      const hasEnoughBalance = currentBalance >= requiredAmount;

      res.json({
        success: true,
        data: {
          currentBalance,
          requiredAmount,
          hasEnoughBalance,
          shortfall: hasEnoughBalance ? 0 : requiredAmount - currentBalance
        }
      });

    } catch (error) {
      console.error('Check balance error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Cancel transaction
  async cancelTransaction(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const { transactionId, status = 'cancelled' } = req.body;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID required'
        });
      }

      const token = authHeader.split(' ')[1];

      // Verify token
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication'
        });
      }

      console.log(`🚫 Cancelling transaction: ${transactionId} for user: ${user.email}`);

      // Update transaction status
      const { data: updatedTransaction, error: updateError } = await supabase
        .from('transactions')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId)
        .eq('user_id', user.id)
        .eq('status', 'pending') // Only cancel pending transactions
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return res.status(400).json({
          success: false,
          error: 'Failed to cancel transaction'
        });
      }

      if (!updatedTransaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found or already processed'
        });
      }

      console.log(`✅ Transaction cancelled successfully: ${transactionId}`);

      res.json({
        success: true,
        data: updatedTransaction,
        message: 'Transaction cancelled successfully'
      });

    } catch (error) {
      console.error('Cancel transaction error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
// Thêm method này vào walletController.js

// Manual check and process pending payments
async checkAndProcessPendingPayments(req, res) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication'
      });
    }

    console.log(`🔍 Checking pending payments for user: ${user.email}`);

    // Get all pending transactions for this user
    const { data: pendingTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (fetchError || !pendingTransactions || pendingTransactions.length === 0) {
      return res.json({
        success: true,
        updated: 0,
        message: 'No pending transactions found'
      });
    }

    console.log(`Found ${pendingTransactions.length} pending transactions`);

    let processedCount = 0;
    const processedTransactions = [];

    // For LOCAL TESTING: Auto-complete transactions older than 30 seconds
    // This simulates successful payment after user completes PayOS payment
    for (const transaction of pendingTransactions) {
      const createdAt = new Date(transaction.created_at);
      const now = new Date();
      const diffSeconds = (now.getTime() - createdAt.getTime()) / 1000;

      // If transaction is older than 30 seconds, assume payment completed
      if (diffSeconds > 30) {
        console.log(`Processing pending transaction: ${transaction.id}`);

        // Get current balance
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', user.id)
          .single();

        if (!profileError && profile) {
          const currentBalance = parseFloat(profile.wallet_balance || 0);
          const depositAmount = parseFloat(transaction.amount);
          const newBalance = currentBalance + depositAmount;

          // Update wallet balance
          const { error: balanceError } = await supabase
            .from('profiles')
            .update({
              wallet_balance: newBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

          if (!balanceError) {
            // Update transaction status
            const { error: txError } = await supabase
              .from('transactions')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', transaction.id);

            if (!txError) {
              processedCount++;
              processedTransactions.push({
                id: transaction.id,
                amount: depositAmount,
                newBalance: newBalance
              });
              console.log(`✅ Transaction ${transaction.id} processed. New balance: ${newBalance}`);
            }
          }
        }
      }
    }

    res.json({
      success: true,
      updated: processedCount,
      transactions: processedTransactions,
      message: `Processed ${processedCount} transactions`
    });

  } catch (error) {
    console.error('Check pending payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
}

module.exports = new WalletController();
