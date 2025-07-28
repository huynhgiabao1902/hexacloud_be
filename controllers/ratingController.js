// controllers/ratingController.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class RatingController {
  // Submit a review (placeholder)
  async submitReview(req, res) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // Get public reviews
  async getPublicReviews(req, res) {
    try {
      console.log('📋 Getting public reviews...');
      
      const { data: reviews, error } = await supabase
        .from('service_reviews')
        .select(`
          id,
          rating,
          review_text,
          service_type,
          created_at,
          user_id
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Get reviews error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch reviews'
        });
      }

      // Get user names separately to avoid RLS issues
      const userIds = [...new Set(reviews.map(r => r.user_id))];
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const userMap = {};
      users?.forEach(user => {
        userMap[user.id] = user.full_name;
      });

      const publicReviews = (reviews || []).map(review => ({
        id: review.id,
        rating: review.rating,
        reviewText: review.review_text,
        serviceType: review.service_type,
        createdAt: review.created_at,
        reviewer: userMap[review.user_id] || 'User'
      }));

      res.json({
        success: true,
        data: publicReviews,
        count: publicReviews.length
      });

    } catch (error) {
      console.error('Get public reviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Test create review
  async testCreateReview(req, res) {
    try {
      console.log('🧪 Testing create review...');
      
      // Get test user
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

      // Create test transaction with required fields
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          payment_id: `test-${Date.now()}`,
          type: 'purchase',
          amount: 0,
          description: 'Test transaction',
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (txError) {
        console.error('Transaction error:', txError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create test transaction',
          details: txError.message
        });
      }

      // Create test review
      const { data: review, error: reviewError } = await supabase
        .from('service_reviews')
        .insert({
          user_id: userId,
          transaction_id: transaction.id,
          rating: Math.floor(Math.random() * 5) + 1, // Random 1-5 stars
          review_text: [
            'Excellent service! Very satisfied with HexaCloud.',
            'Great VPS management platform. Highly recommend!',
            'Easy to use and reliable. Perfect for my needs.',
            'Outstanding support team. Quick response time.',
            'Affordable pricing with excellent features.'
          ][Math.floor(Math.random() * 5)],
          service_type: 'subscription',
          is_anonymous: false
        })
        .select()
        .single();

      if (reviewError) {
        console.error('Review error:', reviewError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create test review',
          details: reviewError.message
        });
      }

      res.json({
        success: true,
        data: {
          transaction,
          review,
          testUser: users[0]
        },
        message: 'Test review created successfully'
      });

    } catch (error) {
      console.error('Test create review error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

module.exports = new RatingController();
