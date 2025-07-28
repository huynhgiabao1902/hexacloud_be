
// controllers/adminController.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class AdminController {
  // Check if user is admin
  async checkAdminAuth(req, res, next) {
    try {
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

      // Check if user is admin (simple check - in production, use proper role-based auth)
      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim());
      
      if (!adminEmails.includes(user.email)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      req.adminUser = user;
      next();

    } catch (error) {
      console.error('Admin auth error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      console.log('📊 Getting admin dashboard stats...');

      // Get date ranges
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Parallel queries for better performance
      const [
        usersStats,
        subscriptionsStats,
        transactionsStats,
        vpsStats,
        reviewsStats,
        revenueStats
      ] = await Promise.all([
        this.getUsersStats(thirtyDaysAgo),
        this.getSubscriptionsStats(),
        this.getTransactionsStats(thirtyDaysAgo),
        this.getVPSStats(),
        this.getReviewsStats(),
        this.getRevenueStats(thirtyDaysAgo)
      ]);

      res.json({
        success: true,
        data: {
          users: usersStats,
          subscriptions: subscriptionsStats,
          transactions: transactionsStats,
          vps: vpsStats,
          reviews: reviewsStats,
          revenue: revenueStats,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Get users statistics
  async getUsersStats(thirtyDaysAgo) {
    try {
      const { data: allUsers, error: totalError } = await supabase
        .from('profiles')
        .select('id, created_at')
        .order('created_at', { ascending: false });

      if (totalError) {
        return { total: 0, newThisMonth: 0, newToday: 0, error: totalError.message };
      }

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const newThisMonth = allUsers.filter(user => 
        new Date(user.created_at) >= thirtyDaysAgo
      ).length;

      const newToday = allUsers.filter(user => 
        new Date(user.created_at) >= todayStart
      ).length;

      return {
        total: allUsers.length,
        newThisMonth,
        newToday,
        growth: allUsers.length > 0 ? ((newThisMonth / allUsers.length) * 100).toFixed(1) : 0
      };
    } catch (error) {
      return { total: 0, newThisMonth: 0, newToday: 0, error: error.message };
    }
  }

  // Get subscriptions statistics
  async getSubscriptionsStats() {
    try {
      const { data: subscriptions, error } = await supabase
        .from('user_subscriptions')
        .select(`
          status,
          created_at,
          subscription_plans(name, price)
        `);

      if (error) {
        return { active: 0, cancelled: 0, expired: 0, byPlan: {}, error: error.message };
      }

      const stats = {
        active: 0,
        cancelled: 0,
        expired: 0,
        byPlan: { Free: 0, Plus: 0, Pro: 0 },
        totalRevenue: 0
      };

      subscriptions.forEach(sub => {
        stats[sub.status] = (stats[sub.status] || 0) + 1;
        
        if (sub.subscription_plans?.name) {
          stats.byPlan[sub.subscription_plans.name] = 
            (stats.byPlan[sub.subscription_plans.name] || 0) + 1;
        }

        if (sub.status === 'active' && sub.subscription_plans?.price) {
          stats.totalRevenue += sub.subscription_plans.price;
        }
      });

      return stats;
    } catch (error) {
      return { active: 0, cancelled: 0, expired: 0, byPlan: {}, error: error.message };
    }
  }

  // Get transactions statistics
  async getTransactionsStats(thirtyDaysAgo) {
    try {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('status, amount, created_at, type')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) {
        return { total: 0, completed: 0, pending: 0, failed: 0, error: error.message };
      }

      const stats = {
        total: transactions.length,
        completed: 0,
        pending: 0,
        failed: 0,
        totalAmount: 0,
        byType: {}
      };

      transactions.forEach(tx => {
        stats[tx.status] = (stats[tx.status] || 0) + 1;
        stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
        
        if (tx.status === 'completed') {
          stats.totalAmount += tx.amount;
        }
      });

      return stats;
    } catch (error) {
      return { total: 0, completed: 0, pending: 0, failed: 0, error: error.message };
    }
  }

  // Get VPS statistics
  async getVPSStats() {
    try {
      const [provisionedResult, manualResult] = await Promise.all([
        supabase.from('provisioned_servers').select('status', { count: 'exact' }),
        supabase.from('user_vps').select('status', { count: 'exact' })
      ]);

      return {
        provisioned: provisionedResult.count || 0,
        manual: manualResult.count || 0,
        total: (provisionedResult.count || 0) + (manualResult.count || 0),
        error: provisionedResult.error || manualResult.error ? 'Failed to fetch VPS stats' : null
      };
    } catch (error) {
      return { provisioned: 0, manual: 0, total: 0, error: error.message };
    }
  }

  // Get reviews statistics
  async getReviewsStats() {
    try {
      const { data: reviews, error } = await supabase
        .from('service_reviews')
        .select('rating, created_at');

      if (error) {
        return { total: 0, averageRating: 0, distribution: {}, error: error.message };
      }

      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let totalRating = 0;

      reviews.forEach(review => {
        distribution[review.rating]++;
        totalRating += review.rating;
      });

      const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : 0;

      return {
        total: reviews.length,
        averageRating: parseFloat(averageRating),
        distribution,
        recentCount: reviews.filter(r => 
          new Date(r.created_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length
      };
    } catch (error) {
      return { total: 0, averageRating: 0, distribution: {}, error: error.message };
    }
  }

  // Get revenue statistics
  async getRevenueStats(thirtyDaysAgo) {
    try {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, created_at, type')
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) {
        return { thisMonth: 0, total: 0, error: error.message };
      }

      const thisMonthRevenue = transactions.reduce((sum, tx) => sum + tx.amount, 0);

      // Get total revenue (all time)
      const { data: allTransactions, error: allError } = await supabase
        .from('transactions')
        .select('amount')
        .eq('status', 'completed');

      const totalRevenue = allTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;

      return {
        thisMonth: thisMonthRevenue,
        total: totalRevenue,
        transactionCount: transactions.length,
        error: allError ? 'Failed to fetch total revenue' : null
      };
    } catch (error) {
      return { thisMonth: 0, total: 0, error: error.message };
    }
  }

  // Get all users for management
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 20, search = '' } = req.query;
      const offset = (page - 1) * limit;

      console.log('👥 Getting all users for admin...');

      let query = supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          wallet_balance,
          total_spent,
          created_at,
          updated_at,
          user_subscriptions(
            status,
            subscription_plans(name, price)
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Search functionality
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data: users, error, count } = await query;

      if (error) {
        console.error('Get all users error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch users'
        });
      }

      res.json({
        success: true,
        data: {
          users: users || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Get all reviews for management
  async getAllReviews(req, res) {
    try {
      const { page = 1, limit = 20, rating, hasResponse } = req.query;
      const offset = (page - 1) * limit;

      console.log('⭐ Getting all reviews for admin...');

      let query = supabase
        .from('service_reviews')
        .select(`
          *,
          profiles(full_name, email),
          transactions(description, amount)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter by rating
      if (rating) {
        query = query.eq('rating', parseInt(rating));
      }

      // Filter by response status
      if (hasResponse !== undefined) {
        if (hasResponse === 'true') {
          query = query.not('admin_response', 'is', null);
        } else {
          query = query.is('admin_response', null);
        }
      }

      const { data: reviews, error, count } = await query;

      if (error) {
        console.error('Get all reviews error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch reviews'
        });
      }

      res.json({
        success: true,
        data: {
          reviews: reviews || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get all reviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Respond to a review
  async respondToReview(req, res) {
    try {
      const { id } = req.params;
      const { response } = req.body;

      if (!response || response.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Response text is required'
        });
      }

      console.log(`💬 Admin responding to review ${id}...`);

      const { data: review, error } = await supabase
        .from('service_reviews')
        .update({
          admin_response: response.trim(),
          admin_responded_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          profiles(full_name, email)
        `)
        .single();

      if (error) {
        return res.status(404).json({
          success: false,
          error: 'Review not found'
        });
      }

      res.json({
        success: true,
        data: review,
        message: 'Response added successfully'
      });

    } catch (error) {
      console.error('Respond to review error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Get recent activities
  async getRecentActivities(req, res) {
    try {
      const { limit = 50 } = req.query;

      console.log('📋 Getting recent activities...');

      // Get recent transactions, subscriptions, and reviews
      const [transactions, subscriptions, reviews] = await Promise.all([
        supabase
          .from('transactions')
          .select(`
            id, type, amount, status, created_at,
            profiles(full_name, email)
          `)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit) / 3),

        supabase
          .from('user_subscriptions')
          .select(`
            id, status, created_at,
            profiles(full_name, email),
            subscription_plans(name, price)
          `)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit) / 3),

        supabase
          .from('service_reviews')
          .select(`
            id, rating, review_text, created_at,
            profiles(full_name, email)
          `)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit) / 3)
      ]);

      // Combine and format activities
      const activities = [
        ...(transactions.data || []).map(tx => ({
          id: `tx_${tx.id}`,
          type: 'transaction',
          title: `${tx.type} - ${tx.amount.toLocaleString()} VND`,
          description: `${tx.profiles?.full_name || 'User'} ${tx.status} transaction`,
          status: tx.status,
          timestamp: tx.created_at,
          user: tx.profiles
        })),
        ...(subscriptions.data || []).map(sub => ({
          id: `sub_${sub.id}`,
          type: 'subscription',
          title: `${sub.subscription_plans?.name} subscription`,
          description: `${sub.profiles?.full_name || 'User'} ${sub.status} subscription`,
          status: sub.status,
          timestamp: sub.created_at,
          user: sub.profiles
        })),
        ...(reviews.data || []).map(review => ({
          id: `review_${review.id}`,
          type: 'review',
          title: `${review.rating} star review`,
          description: `${review.profiles?.full_name || 'User'}: "${review.review_text?.substring(0, 50)}..."`,
          status: 'active',
          timestamp: review.created_at,
          user: review.profiles
        }))
      ];

      // Sort by timestamp and limit
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const recentActivities = activities.slice(0, parseInt(limit));

      res.json({
        success: true,
        data: recentActivities,
        count: recentActivities.length
      });

    } catch (error) {
      console.error('Get recent activities error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Test admin access (no auth required)
  async testAdmin(req, res) {
    try {
      console.log('🧪 Testing admin access...');
      
      const stats = await this.getDashboardStats({ query: {} }, { json: () => {} });
      
      res.json({
        success: true,
        message: 'Admin controller working',
        timestamp: new Date().toISOString(),
        availableEndpoints: [
          'GET /api/admin/dashboard/stats',
          'GET /api/admin/users',
          'GET /api/admin/reviews',
          'POST /api/admin/reviews/:id/respond',
          'GET /api/admin/activities'
        ]
      });

    } catch (error) {
      console.error('Test admin error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

module.exports = new AdminController();
