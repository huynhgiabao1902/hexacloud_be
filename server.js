const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
require('dotenv').config();

const SSHManager = require('./utils/SSHManager');
const GoogleCloudService = require('./services/googleCloudService');
const WebSocketServer = require('./websocket/websocketServer');

// Import routes
const vpsRoutes = require('./routes/vps');
const googleCloudRoutes = require('./routes/googleCloud');
const sshRoutes = require('./routes/ssh');
const walletRoutes = require('./routes/wallet');
const subscriptionRoutes = require('./routes/subscription');
const enhancedVpsRoutes = require('./routes/enhancedVps');
const ratingRoutes = require('./routes/rating');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payment');

// Initialize services
const sshManager = new SSHManager();
const gcpService = new GoogleCloudService();

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const gcpStatus = await gcpService.testConnection();
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        api: 'running',
        websocket: 'running',
        googleCloud: gcpStatus.success ? 'connected' : 'disconnected',
        sshManager: 'running',
        subscription: 'running',
        enhancedVps: 'running',
        rating: 'running',
        admin: 'running',
        payment: 'running'
      },
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API Routes
app.use('/api/vps', vpsRoutes);
app.use('/api/gcp', googleCloudRoutes);
app.use('/api/ssh', sshRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/enhanced-vps', enhancedVpsRoutes);
app.use('/api/rating', ratingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'HexaCloud Backend API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      vps: '/api/vps',
      enhancedVps: '/api/enhanced-vps',
      googleCloud: '/api/gcp',
      ssh: '/api/ssh',
      wallet: '/api/wallet',
      subscription: '/api/subscription',
      rating: '/api/rating',
      admin: '/api/admin',
      payment: '/api/payment'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Initialize WebSocket Server
const wsPort = process.env.WS_PORT || 8081;
const websocketServer = new WebSocketServer(wsPort);

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('🛑 Shutting down gracefully...');
  if (websocketServer) websocketServer.close();
  if (sshManager && sshManager.closeAllConnections) sshManager.closeAllConnections();
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const port = process.env.PORT || 8080;
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
  console.log('\n🚀 ===== HexaCloud Backend v2.0 Started =====');
  console.log(`📡 HTTP Server: http://${host}:${port}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${wsPort}`);
  console.log('\n✅ APIs Available:');
  console.log('   📋 Subscription: /api/subscription');
  console.log('   🖥️  Enhanced VPS: /api/enhanced-vps');
  console.log('   ⭐ Rating: /api/rating');
  console.log('   👑 Admin: /api/admin');
  console.log('   ☁️  Google Cloud: /api/gcp');
  console.log('   💰 Wallet: /api/wallet');
  console.log('   💳 Payment: /api/payment');
  console.log('   🔌 SSH: /api/ssh');
  console.log('   🖥️  VPS: /api/vps');
  console.log(`\n👑 Admin Email: ${process.env.ADMIN_EMAILS || 'Not configured'}`);
  console.log('=======================================\n');

  websocketServer.start();

  setTimeout(async () => {
    try {
      const gcpTest = await gcpService.testConnection();
      console.log(gcpTest.success ? '✅ Google Cloud connected' : '⚠️ Google Cloud disconnected');
    } catch (error) {
      console.log('⚠️ Google Cloud test failed:', error.message);
    }
  }, 2000);
});

module.exports = { app, server, websocketServer };
