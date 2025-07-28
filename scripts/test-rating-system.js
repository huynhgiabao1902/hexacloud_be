require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:8080/api/rating';

async function testRatingSystem() {
  console.log('🧪 Testing Rating System...\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing Rating API Health...');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log(`✅ ${health.data.message}\n`);

    // Test 2: Create test review
    console.log('2️⃣ Creating Test Review...');
    const createResp = await axios.post(`${BASE_URL}/test-create`);
    if (createResp.data.success) {
      console.log(`✅ Test review created by: ${createResp.data.data.testUser.full_name}`);
      console.log(`   ⭐ Rating: ${createResp.data.data.review.rating} stars`);
      console.log(`   💬 Review: ${createResp.data.data.review.review_text}`);
    } else {
      console.log(`❌ ${createResp.data.message || createResp.data.error}`);
    }

    // Test 3: Get public reviews
    console.log('\n3️⃣ Getting Public Reviews...');
    const publicResp = await axios.get(`${BASE_URL}/public`);
    if (publicResp.data.success) {
      console.log(`✅ Found ${publicResp.data.count} public reviews:`);
      publicResp.data.data.forEach(review => {
        console.log(`   ⭐ ${review.rating} stars - ${review.reviewer}: "${review.reviewText}"`);
      });
    } else {
      console.log(`❌ ${publicResp.data.error}`);
    }

    console.log('\n🎉 Rating System Test Complete!');

  } catch (error) {
    console.error('❌ Rating system test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

testRatingSystem();
