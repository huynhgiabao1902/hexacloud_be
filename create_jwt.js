const jwt = require('jsonwebtoken');

// User ID từ database (user đầu tiên)
const userId = 'ba447d12-87b0-4a60-af85-3cb17de185bf';

// JWT payload theo format của Supabase
const payload = {
  aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
  sub: userId,
  email: 'test@example.com',
  role: 'authenticated'
};

// Sử dụng JWT secret thực từ Supabase
const secret = 'CgS7aYCYZS9OwvocRM8jp0wRoeWe5DILz6DF9IsUPk6sjWmsB6s9KdLBj1i5A1pRg2RLhJj1MthF3TFnAww5Vw==';

const token = jwt.sign(payload, secret);
console.log('Generated JWT Token:');
console.log(token);
