const { createClient } = require('@supabase/supabase-js');
const PayOS = require('@payos/node');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize PayOS
const payOS = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

class PaymentController {
  // Create payment link for wallet deposit
  async createDepositPayment(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const { amount, description = 'Nạp tiền vào ví HexaCloud' } = req.body;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      if (!amount || amount < 10000) {
        return res.status(400).json({
          success: false,
          error: 'Minimum deposit amount is 10,000 VND'
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

      console.log(`💰 Creating deposit payment for user: ${user.email}`);

      // Create transaction record
      const paymentId = `DEP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          payment_id: paymentId,
          type: 'deposit',
          amount: parseInt(amount),
          description: description,
          status: 'pending',
          payment_method: 'payos'
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

      // Create PayOS payment
      const paymentData = {
        orderCode: parseInt(paymentId.replace(/[^0-9]/g, '').slice(-8)),
        amount: parseInt(amount),
        description: description,
        returnUrl: `${process.env.CLIENT_URL}/payment/success`,
        cancelUrl: `${process.env.CLIENT_URL}/payment/cancel`
      };

      const paymentLink = await payOS.createPaymentLink(paymentData);

      // Update transaction with PayOS info
      await supabase
        .from('transactions')
        .update({
          payment_url: paymentLink.checkoutUrl,
          qr_code: paymentLink.qrCode,
          external_transaction_id: paymentLink.orderCode.toString(),
          metadata: {
            payos_order_code: paymentLink.orderCode,
            payos_payment_id: paymentLink.paymentLinkId
          }
        })
        .eq('id', transaction.id);

      console.log(`✅ Payment link created: ${paymentLink.checkoutUrl}`);

      res.json({
        success: true,
        data: {
          transaction: transaction,
          paymentUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          orderCode: paymentLink.orderCode,
          amount: parseInt(amount)
        },
        message: 'Payment link created successfully'
      });

    } catch (error) {
      console.error('Create deposit payment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create payment',
        details: error.message
      });
    }
  }

  // PayOS webhook to handle payment status
  async handlePaymentWebhook(req, res) {
    try {
      console.log('📨 PayOS webhook received:', req.body);

      const { data } = req.body;
      
      if (!data || !data.orderCode) {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook data'
        });
      }

      // Find transaction by order code
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('external_transaction_id', data.orderCode.toString())
        .single();

      if (txError || !transaction) {
        console.error('Transaction not found:', data.orderCode);
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      // Update transaction status based on payment result
      let newStatus = 'pending';
      if (data.code === '00') {
        newStatus = 'completed';
      } else if (data.code === '01') {
        newStatus = 'failed';
      }

      await supabase
        .from('transactions')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
          metadata: {
            ...transaction.metadata,
            payos_response: data
          }
        })
        .eq('id', transaction.id);

      // If payment successful, update wallet balance
      if (newStatus === 'completed') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', transaction.user_id)
          .single();

        if (!profileError && profile) {
          const currentBalance = parseFloat(profile.wallet_balance || 0);
          const newBalance = currentBalance + transaction.amount;

          await supabase
            .from('profiles')
            .update({
              wallet_balance: newBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', transaction.user_id);

          console.log(`✅ Wallet updated: ${currentBalance} → ${newBalance} VND`);
        }
      }

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      console.error('Payment webhook error:', error);
      res.status(500).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  }

  // Check payment status
  async checkPaymentStatus(req, res) {
    try {
      const { transactionId } = req.params;
      const authHeader = req.headers.authorization;

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

      // Get transaction
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('user_id', user.id)
        .single();

      if (txError || !transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      // Check PayOS status if still pending
      if (transaction.status === 'pending' && transaction.external_transaction_id) {
        try {
          const paymentInfo = await payOS.getPaymentLinkInformation(
            parseInt(transaction.external_transaction_id)
          );

          if (paymentInfo.status === 'PAID') {
            // Update transaction and wallet
            await supabase
              .from('transactions')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', transaction.id);

            // Update wallet balance
            const { data: profile } = await supabase
              .from('profiles')
              .select('wallet_balance')
              .eq('id', user.id)
              .single();

            if (profile) {
              const newBalance = parseFloat(profile.wallet_balance || 0) + transaction.amount;
              await supabase
                .from('profiles')
                .update({ wallet_balance: newBalance })
                .eq('id', user.id);
            }

            transaction.status = 'completed';
          }
        } catch (payosError) {
          console.error('PayOS check error:', payosError);
        }
      }

      res.json({
        success: true,
        data: {
          transaction,
          paymentUrl: transaction.payment_url,
          qrCode: transaction.qr_code
        }
      });

    } catch (error) {
      console.error('Check payment status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Test payment (sandbox)
  async testPayment(req, res) {
    try {
      console.log('🧪 Testing payment integration...');

      const testPayment = {
        orderCode: parseInt(Date.now().toString().slice(-8)),
        amount: 10000,
        description: 'Test payment - HexaCloud',
        returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success`,
        cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/cancel`
      };

      const paymentLink = await payOS.createPaymentLink(testPayment);

      res.json({
        success: true,
        data: {
          paymentUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          orderCode: paymentLink.orderCode,
          amount: testPayment.amount
        },
        message: 'Test payment created successfully'
      });

    } catch (error) {
      console.error('Test payment error:', error);
      res.status(500).json({
        success: false,
        error: 'Test payment failed',
        details: error.message
      });
    }
  }

  // Create payment link for subscription purchase
  async purchaseSubscriptionPayment(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const { planId, description = 'Thanh toán mua gói HexaCloud' } = req.body;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required'
        });
      }

      if (!planId) {
        return res.status(400).json({
          success: false,
          error: 'Missing planId'
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

      // Lấy thông tin gói
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();
      if (planError || !plan) {
        return res.status(404).json({
          success: false,
          error: 'Subscription plan not found'
        });
      }

      // Tạo transaction
      const paymentId = `SUBPAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          payment_id: paymentId,
          type: 'subscription_purchase',
          amount: parseInt(plan.price),
          description: `Mua gói: ${plan.name}`,
          status: 'pending',
          payment_method: 'payos',
          metadata: { plan_id: planId, plan_name: plan.name }
        })
        .select()
        .single();
      if (txError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create transaction'
        });
      }

      // Tạo payment link qua PayOS
      const paymentData = {
        orderCode: parseInt(paymentId.replace(/[^0-9]/g, '').slice(-8)),
        amount: parseInt(plan.price),
        description: `Mua gói: ${plan.name}`,
        returnUrl: `${process.env.CLIENT_URL}/payment/success`,
        cancelUrl: `${process.env.CLIENT_URL}/payment/cancel`
      };
      const paymentLink = await payOS.createPaymentLink(paymentData);

      // Update transaction với thông tin PayOS
      await supabase
        .from('transactions')
        .update({
          payment_url: paymentLink.checkoutUrl,
          qr_code: paymentLink.qrCode,
          external_transaction_id: paymentLink.orderCode.toString(),
          metadata: {
            ...transaction.metadata,
            payos_order_code: paymentLink.orderCode,
            payos_payment_id: paymentLink.paymentLinkId
          }
        })
        .eq('id', transaction.id);

      res.json({
        success: true,
        data: {
          transaction: transaction,
          paymentUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          orderCode: paymentLink.orderCode,
          amount: parseInt(plan.price),
          plan: plan
        },
        message: 'Payment link for subscription created successfully'
      });
    } catch (error) {
      console.error('Create subscription payment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create subscription payment',
        details: error.message
      });
    }
  }
}

module.exports = new PaymentController();
