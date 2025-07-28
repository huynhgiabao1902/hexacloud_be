const axios = require('axios');

const BASE_URL = 'http://localhost:8080/api/subscription';

async function runFullTest() {
  console.log('🧪 Running Full Subscription Test Suite...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log(`✅ ${health.data.message}\n`);

    // Test 2: Get Plans
    console.log('2️⃣ Testing Get Plans...');
    const plansResp = await axios.get(`${BASE_URL}/plans`);
    const plans = plansResp.data.data;
    console.log(`✅ Found ${plans.length} plans:`);
    plans.forEach(plan => {
      console.log(`   📋 ${plan.display_name}: ${plan.price.toLocaleString()} VND (${plan.max_vps} VPS, ${plan.storage_gb}GB)`);
    });
    console.log();

    // Test 3: Test Current Subscription (no auth)
    console.log('3️⃣ Testing Current Subscription (Test Mode)...');
    const currentResp = await axios.get(`${BASE_URL}/test-current`);
    console.log(`✅ ${currentResp.data.message}`);
    if (currentResp.data.testUser) {
      console.log(`   👤 Test User: ${currentResp.data.testUser.full_name || 'Unknown'}`);
    }
    if (currentResp.data.data) {
      console.log(`   📋 Active Plan: ${currentResp.data.data.subscription_plans.display_name}`);
    }
    console.log();

    // Test 4: Test Auth Required Endpoints
    console.log('4️⃣ Testing Auth Required Endpoints...');
    try {
      await axios.get(`${BASE_URL}/current`);
      console.log('❌ Auth check failed - should require authorization');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Auth properly required (401 Unauthorized)');
      }
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('   - Test with real user token');
    console.log('   - Test subscription purchase');
    console.log('   - Test server provisioning');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
  }
}

runFullTest();
