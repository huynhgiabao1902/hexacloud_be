require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔗 Supabase URL:', supabaseUrl ? 'Found' : 'Missing');
console.log('🔑 Service Key:', supabaseServiceKey ? 'Found' : 'Missing');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestSubscription() {
  try {
    console.log('🧪 Creating test subscription...');

    // Get test user
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name')
      .limit(1);

    if (!users || users.length === 0) {
      console.log('❌ No users found');
      return;
    }

    const userId = users[0].id;
    console.log(`👤 Test user: ${users[0].full_name}`);

    // Get Free plan
    const { data: freePlan } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', 'Free')
      .single();

    if (!freePlan) {
      console.log('❌ Free plan not found');
      return;
    }

    console.log(`📋 Free plan: ${freePlan.display_name}`);

    // Check if user already has subscription
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (existingSub) {
      console.log('✅ User already has active subscription');
      return;
    }

    // Create subscription
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: userId,
        plan_id: freePlan.id,
        status: 'active',
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating subscription:', error);
      return;
    }

    console.log('✅ Free subscription created successfully!');
    console.log(`📅 Expires: ${subscription.expires_at}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createTestSubscription();
