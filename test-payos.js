const PayOS = require('@payos/node');

const payos = new PayOS(
  '1bf79f28-0022-4113-820e-849dbe15770e',
  '5eaaf545-633e-43ad-98a9-1f327a21d2d0',
  '5e7099de629cadb615665f171563b6d215e05ed617ec0ba2658cc4c06028cb81'
);

async function testPayOS() {
  try {
    const paymentData = {
      orderCode: Date.now(),
      amount: 10000,
      description: 'Test payment',
      returnUrl: 'http://localhost:3000/payment/success',
      cancelUrl: 'http://localhost:3000/payment/cancel'
    };
    
    console.log('Testing PayOS with:', paymentData);
    const result = await payos.createPaymentLink(paymentData);
    console.log('✅ Success:', result);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPayOS();
