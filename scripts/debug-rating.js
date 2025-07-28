require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugRating() {
  console.log('🔍 Debugging Rating System...\n');

  try {
    // Test 1: Check tables exist
    console.log('1️⃣ Checking database tables...');
    
    // Check transactions table structure
    const { data: transactionTest, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .limit(1);
    
    if (transactionError) {
      console.log('❌ transactions table error:', transactionError.message);
      console.log('   Details:', transactionError);
    } else {
      console.log('✅ transactions table exists');
    }

    // Check service_reviews table structure
    const { data: reviewTest, error: reviewError } = await supabase
      .from('service_reviews')
      .select('*')
      .limit(1);
    
    if (reviewError) {
      console.log('❌ service_reviews table error:', reviewError.message);
      console.log('   Details:', reviewError);
    } else {
      console.log('✅ service_reviews table exists');
    }

    // Get test user
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .limit(1);
    
    if (userError) {
      console.log('❌ profiles table error:', userError.message);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('❌ No users found in profiles table');
      return;
    }
    
    const userId = users[0].id;
    console.log(`👤 Test user: ${users[0].full_name} (${userId})`);

    // Test 2: Try to create transaction with minimal data
    console.log('\n2️⃣ Testing transaction creation...');
    
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'subscription_purchase',
        amount: 0,
        description: 'Debug test transaction',
        status: 'completed'
      })
      .select()
      .single();

    if (txError) {
      console.log('❌ Transaction creation error:', txError.message);
      console.log('   Code:', txError.code);
      console.log('   Details:', txError.details);
      console.log('   Hint:', txError.hint);
    } else {
      console.log('✅ Transaction created successfully:', transaction.id);
      
      // Test 3: Create review
      console.log('\n3️⃣ Testing review creation...');
      
      const { data: review, error: reviewError2 } = await supabase
        .from('service_reviews')
        .insert({
          user_id: userId,
          transaction_id: transaction.id,
          rating: 5,
          review_text: 'Debug test review - excellent service!',
          service_type: 'subscription'
        })
        .select()
        .single();

      if (reviewError2) {
        console.log('❌ Review creation error:', reviewError2.message);
        console.log('   Code:', reviewError2.code);
        console.log('   Details:', reviewError2.details);
      } else {
        console.log('✅ Review created successfully:', review.id);
      }
    }

    // Test 4: Get existing reviews
    console.log('\n4️⃣ Getting existing reviews...');
    
    const { data: existingReviews, error: getError } = await supabase
      .from('service_reviews')
      .select(`
        id,
        rating,
        review_text,
        service_type,
        created_at
      `)
      .limit(5);

    if (getError) {
      console.log('❌ Get reviews error:', getError.message);
    } else {
      console.log(`✅ Found ${existingReviews.length} existing reviews`);
      existingReviews.forEach(r => {
        console.log(`   ⭐ ${r.rating} stars: "${r.review_text}"`);
      });
    }

  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugRating();
